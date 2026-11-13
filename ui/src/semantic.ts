import type { Document, SemanticHit } from './types';

// QUESTIONS are examples for the semantic search of the demo documents.
export const QUESTIONS = [
  'How much is the pay for each job level?',
  'When is the office closed?',
  'Is there a confidential merger?',
];

// titleOf returns the title part of a hit text. 'demo load --embeddings' makes
// each vector from "<title>. <description>".
export function titleOf(text: string | undefined): string {
  const t = text ?? '';
  const i = t.indexOf('. ');
  return i > 0 ? t.slice(0, i) : t;
}

// hitDocument returns the document of a hit, as far as the hit knows it: the
// id and the title, but not the path.
export function hitDocument(h: SemanticHit): Document {
  return { sys_id: h.docId, sys_title: titleOf(h.text), sys_path: '', sys_primaryType: 'SysFile' };
}
