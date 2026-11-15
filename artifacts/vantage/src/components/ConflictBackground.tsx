export function ConflictBackground({ text, active }: { text: string; active: boolean }) {
  return (
    <div
      style={{
        borderLeft: "3px solid var(--accent-navy-border)",
        paddingLeft: "16px",
        opacity: active ? 1 : 0,
        transition: "opacity 0.6s ease",
      }}
    >
      <p style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "17px", color: "var(--text-secondary)", lineHeight: "1.65" }}>
        {text}
      </p>
    </div>
  );
}
