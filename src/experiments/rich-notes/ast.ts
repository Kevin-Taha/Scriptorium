/** The small Markdown subset notes understand, as plain data (rendered by RichText). */
export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'math'; value: string; display: boolean }
  | { type: 'br' };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'math'; value: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] };
