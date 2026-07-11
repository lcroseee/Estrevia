import type { ExtraProps } from 'react-markdown';

/**
 * Prose component map for react-markdown essay rendering.
 *
 * react-markdown (v10) passes each custom component a `node` prop (the hast
 * element). Spreading it onto the DOM element leaked `node="[object Object]"`
 * into the SSR HTML on every tag. Each component destructures `node` out of the
 * spread (typed via react-markdown's ExtraProps) so it never reaches the DOM.
 */
export const PROSE_COMPONENTS = {
  h2: ({ node, children, ...props }: React.ComponentProps<'h2'> & ExtraProps) => (
    <h2
      {...props}
      className="mt-10 mb-4 text-xl font-semibold text-white/90 font-[var(--font-geist-sans)] tracking-tight border-b border-white/6 pb-2"
    >
      {children}
    </h2>
  ),
  h3: ({ node, children, ...props }: React.ComponentProps<'h3'> & ExtraProps) => (
    <h3
      {...props}
      className="mt-7 mb-3 text-base font-medium text-white/80 font-[var(--font-geist-sans)]"
    >
      {children}
    </h3>
  ),
  p: ({ node, children, ...props }: React.ComponentProps<'p'> & ExtraProps) => (
    <p
      {...props}
      className="mb-5 text-base text-white/70 leading-[1.8] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif]"
    >
      {children}
    </p>
  ),
  ul: ({ node, children, ...props }: React.ComponentProps<'ul'> & ExtraProps) => (
    <ul {...props} className="mb-5 space-y-2 pl-5">
      {children}
    </ul>
  ),
  li: ({ node, children, ...props }: React.ComponentProps<'li'> & ExtraProps) => (
    <li
      {...props}
      className="text-base text-white/65 leading-[1.75] font-[var(--font-crimson-pro),_'Crimson_Pro',_Georgia,_serif] list-disc marker:text-white/25"
    >
      {children}
    </li>
  ),
  strong: ({ node, children, ...props }: React.ComponentProps<'strong'> & ExtraProps) => (
    <strong {...props} className="font-semibold text-white/85">
      {children}
    </strong>
  ),
  em: ({ node, children, ...props }: React.ComponentProps<'em'> & ExtraProps) => (
    <em {...props} className="italic text-white/75">
      {children}
    </em>
  ),
  blockquote: ({ node, children, ...props }: React.ComponentProps<'blockquote'> & ExtraProps) => (
    <blockquote
      {...props}
      className="my-6 border-l-2 border-white/15 pl-5 text-sm text-white/40 italic font-[var(--font-geist-sans)]"
    >
      {children}
    </blockquote>
  ),
  table: ({ node, children, ...props }: React.ComponentProps<'table'> & ExtraProps) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/8">
      <table {...props} className="w-full text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ node, children, ...props }: React.ComponentProps<'thead'> & ExtraProps) => (
    <thead {...props} className="bg-white/5 border-b border-white/8">
      {children}
    </thead>
  ),
  th: ({ node, children, ...props }: React.ComponentProps<'th'> & ExtraProps) => (
    <th
      {...props}
      className="px-4 py-2.5 text-left text-[10px] text-white/35 uppercase tracking-widest font-[var(--font-geist-sans)]"
    >
      {children}
    </th>
  ),
  td: ({ node, children, ...props }: React.ComponentProps<'td'> & ExtraProps) => (
    <td
      {...props}
      className="px-4 py-2.5 text-white/65 border-t border-white/5 font-[var(--font-geist-sans)]"
    >
      {children}
    </td>
  ),
  code: ({ node, children, ...props }: React.ComponentProps<'code'> & ExtraProps) => (
    <code
      {...props}
      className="font-[var(--font-geist-mono)] text-xs bg-white/6 border border-white/8 rounded px-1.5 py-0.5 text-white/75"
    >
      {children}
    </code>
  ),
  hr: ({ node, ...props }: React.ComponentProps<'hr'> & ExtraProps) => (
    <hr {...props} className="my-8 border-white/8" />
  ),
} as const;
