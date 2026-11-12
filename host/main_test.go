package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func encode(t *testing.T, args ...string) string {
	t.Helper()
	data, err := json.Marshal(args)
	if err != nil {
		t.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

// fake records the openarch calls.
type fake struct {
	calls [][]string
	env   []string
	code  int
}

func (f *fake) run(args, env []string, stdout, _ io.Writer) int {
	f.calls = append(f.calls, args)
	f.env = env
	_, _ = io.WriteString(stdout, "{}\n")
	return f.code
}

func TestRunDecodesArguments(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	query := `SELECT * FROM SysFile WHERE sys_path STARTSWITH '/Demo/' AND x = "a;b|c" -- $HOME ñ`
	f := &fake{}
	var out bytes.Buffer
	if code := run([]string{encode(t, "query", query, "--sync")}, &out, io.Discard, f.run); code != 0 {
		t.Fatalf("code = %d, out = %s", code, out.String())
	}
	want := []string{"query", query, "--sync", "--dir", filepath.Join(home, ".openarch", "openarch-desktop")}
	if len(f.calls) != 1 || !slices.Equal(f.calls[0], want) {
		t.Errorf("args = %q, want %q", f.calls, want)
	}
	if !slices.Contains(f.env, "OPENARCH_CONFIG_DIR="+filepath.Join(home, ".openarch", "openarch-desktop-config")) ||
		!slices.Contains(f.env, "OPENARCH_CREDENTIAL_STORE=file") {
		t.Errorf("env misses the extension settings")
	}
}

func TestRunPassesExitCode(t *testing.T) {
	f := &fake{code: 4}
	if code := run([]string{encode(t, "status")}, io.Discard, io.Discard, f.run); code != 4 {
		t.Errorf("code = %d, want 4", code)
	}
}

func TestRunRefuses(t *testing.T) {
	for name, arg := range map[string]string{
		"not base64":  "not base64!",
		"not a list":  base64.RawURLEncoding.EncodeToString([]byte(`{"a":1}`)),
		"empty":       encode(t),
		"self-update": encode(t, "self-update"),
		"dir":         encode(t, "status", "--dir", "/tmp/x"),
		"dir=":        encode(t, "status", "--dir=/tmp/x"),
		"dashdash":    encode(t, "query", "--", "x"),
	} {
		f := &fake{}
		var out bytes.Buffer
		code := run([]string{arg}, &out, io.Discard, f.run)
		var res struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if code != exitUsage || len(f.calls) != 0 || json.Unmarshal(out.Bytes(), &res) != nil || res.Error.Code != "usage" {
			t.Errorf("%s: code = %d, calls = %v, out = %s", name, code, f.calls, out.String())
		}
	}
	if code := run(nil, io.Discard, io.Discard, (&fake{}).run); code != exitUsage {
		t.Errorf("no argument: code = %d", code)
	}
}

func TestRemoveAll(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	p := pathsFor(home)
	keep := filepath.Join(home, ".openarch", "other")
	for _, d := range []string{p.workspace, p.config, keep} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(p.workspace, "openarch.yaml"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	f := &fake{}
	var out bytes.Buffer
	if code := run([]string{encode(t, "remove-all")}, &out, io.Discard, f.run); code != 0 {
		t.Fatalf("code = %d, out = %s", code, out.String())
	}
	if len(f.calls) != 1 || f.calls[0][0] != "clean" || !slices.Contains(f.calls[0], "--yes") {
		t.Errorf("calls = %q", f.calls)
	}
	for _, d := range []string{p.workspace, p.config} {
		if _, err := os.Stat(d); !os.IsNotExist(err) {
			t.Errorf("%s still exists", d)
		}
	}
	if _, err := os.Stat(keep); err != nil {
		t.Errorf("other folders must stay: %v", err)
	}
	if !strings.Contains(out.String(), `"action": "removed"`) {
		t.Errorf("out = %s", out.String())
	}

	// A failed clean keeps the folders.
	if err := os.MkdirAll(p.workspace, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(p.workspace, "openarch.yaml"), []byte("x"), 0o644)
	if code := run([]string{encode(t, "remove-all")}, io.Discard, io.Discard, (&fake{code: 1}).run); code != 1 {
		t.Errorf("code = %d", code)
	}
	if _, err := os.Stat(p.workspace); err != nil {
		t.Errorf("workspace must stay after a failed clean: %v", err)
	}

	// Without a workspace, nothing runs.
	_ = os.RemoveAll(p.workspace)
	f = &fake{}
	if code := run([]string{encode(t, "remove-all")}, io.Discard, io.Discard, f.run); code != 0 || len(f.calls) != 0 {
		t.Errorf("code = %d, calls = %v", code, f.calls)
	}
}
