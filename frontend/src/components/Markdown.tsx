import ReactMarkdown, { type Components } from "react-markdown";

// Model output is untrusted. react-markdown does not render raw HTML (no
// rehype-raw), and its default URL transform drops javascript:, data:, and
// other non-http(s)/mailto protocols. Images are disallowed entirely so that
// model output can never trigger a remote request.
const components: Components = {
  a({ href, children }) {
    if (!href) {
      return <span>{children}</span>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        components={components}
        disallowedElements={["img"]}
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
