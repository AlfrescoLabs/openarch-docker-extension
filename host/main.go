// Command openarch-dd runs the bundled openarch CLI for the Docker Desktop
// extension.
//
// Docker Desktop joins the arguments of ddClient.extension.host.cli.exec into
// one "/bin/sh -c" string with no quoting: spaces split an argument, "$"
// expands, and quotes, ";" and "|" are refused. So the extension sends one
// argument: the base64url encoding (no padding) of a JSON array of strings,
// which are the real arguments of openarch.
//
// The helper keeps the extension apart from a CLI the user may also run: it
// uses its own config folder and the file credential store (a process started
// by Docker Desktop has no terminal for keychain prompts), and always passes
// --dir with the extension workspace.
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
)

// Exit codes, the same as the openarch CLI.
const (
	exitOK    = 0
	exitError = 1
	exitUsage = 2
)

// Folders under the home folder.
const (
	baseDir      = ".openarch"
	workspaceDir = "openarch-desktop"
	configDir    = "openarch-desktop-config"
)

// removeAll is the helper's own action: it removes the stack, the workspace and the config folder.
const removeAll = "remove-all"

// refused are openarch commands the extension must not run.
var refused = []string{"self-update"}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, runOpenArch))
}

// paths are the folders of the extension.
type paths struct {
	workspace string
	config    string
}

func pathsFor(home string) paths {
	return paths{
		workspace: filepath.Join(home, baseDir, workspaceDir),
		config:    filepath.Join(home, baseDir, configDir),
	}
}

// runner runs openarch with args and env, and returns its exit code.
type runner func(args, env []string, stdout, stderr io.Writer) int

func run(args []string, stdout, stderr io.Writer, openarch runner) int {
	if len(args) != 1 {
		return fail(stdout, exitUsage, "openarch-dd needs one argument: the base64url JSON array of the openarch arguments")
	}
	argv, err := decode(args[0])
	if err != nil {
		return fail(stdout, exitUsage, err.Error())
	}
	if len(argv) == 0 {
		return fail(stdout, exitUsage, "no openarch command")
	}
	if slices.Contains(refused, argv[0]) {
		return fail(stdout, exitUsage, fmt.Sprintf("the extension does not run 'openarch %s'", argv[0]))
	}
	if slices.ContainsFunc(argv, func(a string) bool { return a == "--" || a == "--dir" || strings.HasPrefix(a, "--dir=") }) {
		return fail(stdout, exitUsage, "the arguments cannot contain -- or --dir: the helper sets the workspace")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return fail(stdout, exitError, "cannot find the home folder: "+err.Error())
	}
	p := pathsFor(home)
	env := append(os.Environ(), "OPENARCH_CONFIG_DIR="+p.config, "OPENARCH_CREDENTIAL_STORE=file")
	if argv[0] == removeAll {
		return remove(p, env, stdout, stderr, openarch)
	}
	return openarch(append(argv, "--dir", p.workspace), env, stdout, stderr)
}

// decode reads the JSON array of arguments from its base64url form.
func decode(s string) ([]string, error) {
	data, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, errors.New("the argument is not base64url without padding: " + err.Error())
	}
	var argv []string
	if err := json.Unmarshal(data, &argv); err != nil {
		return nil, errors.New("the argument is not a JSON array of strings: " + err.Error())
	}
	return argv, nil
}

// remove stops the stack and deletes its data, then deletes the workspace and
// config folders. 'openarch clean' alone keeps the workspace files, and a new
// 'openarch init' then fails.
func remove(p paths, env []string, stdout, stderr io.Writer, openarch runner) int {
	if _, err := os.Stat(filepath.Join(p.workspace, "openarch.yaml")); err == nil {
		if code := openarch([]string{"clean", "--yes", "--output", "json", "--dir", p.workspace}, env, io.Discard, stderr); code != exitOK {
			return fail(stdout, code, "'openarch clean' failed, so the folders were not deleted")
		}
	}
	for _, d := range []string{p.workspace, p.config} {
		if err := os.RemoveAll(d); err != nil {
			return fail(stdout, exitError, "cannot delete "+d+": "+err.Error())
		}
	}
	return write(stdout, map[string]any{"action": "removed", "workspace": p.workspace, "config": p.config})
}

// runOpenArch runs the openarch binary next to this one.
func runOpenArch(args, env []string, stdout, stderr io.Writer) int {
	self, err := os.Executable()
	if err != nil {
		return fail(stdout, exitError, "cannot find the helper path: "+err.Error())
	}
	name := "openarch"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	cmd := exec.Command(filepath.Join(filepath.Dir(self), name), args...)
	cmd.Env, cmd.Stdout, cmd.Stderr = env, stdout, stderr
	err = cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode()
	}
	if err != nil {
		return fail(stdout, exitError, "cannot run openarch: "+err.Error())
	}
	return exitOK
}

// codeNames are the JSON error names of the openarch exit codes.
var codeNames = map[int]string{1: "error", 2: "usage", 3: "prerequisite", 4: "unhealthy", 5: "remote", 6: "auth"}

// fail writes an error in the JSON form of the openarch CLI and returns code.
func fail(stdout io.Writer, code int, msg string) int {
	name, ok := codeNames[code]
	if !ok {
		name = "error"
	}
	write(stdout, map[string]any{"error": map[string]any{"code": name, "message": msg}})
	return code
}

func write(w io.Writer, v any) int {
	data, _ := json.MarshalIndent(v, "", "  ")
	_, _ = fmt.Fprintln(w, string(data))
	return exitOK
}
