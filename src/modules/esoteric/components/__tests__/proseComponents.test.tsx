import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PROSE_COMPONENTS } from '../proseComponents';

// Stand-in for the hast `node` prop react-markdown passes to every component.
const fakeNode = { type: 'element', tagName: 'p', properties: {}, children: [] };

describe('PROSE_COMPONENTS never leak react-markdown `node` to the DOM', () => {
  for (const tag of Object.keys(PROSE_COMPONENTS)) {
    it(`<${tag}> renders no node="[object Object]" attribute`, () => {
      const Comp = PROSE_COMPONENTS[tag as keyof typeof PROSE_COMPONENTS];
      // Pass no children: <hr> is a void element and throws if given any.
      const html = renderToStaticMarkup(createElement(Comp as never, { node: fakeNode }));
      expect(html).not.toContain('node=');
      expect(html).not.toContain('[object Object]');
    });
  }

  it('still renders paragraph children after stripping node', () => {
    const html = renderToStaticMarkup(
      createElement(PROSE_COMPONENTS.p as never, { node: fakeNode, children: 'hello world' }),
    );
    expect(html).toContain('hello world');
    expect(html).not.toContain('node=');
  });
});
