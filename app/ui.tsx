// Small presentational pieces shared by the server page and the client board.

export function SectionTitle({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">
        <span className="mr-2">{emoji}</span>
        {title}
      </h2>
      <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
    </div>
  );
}

export function Notice({
  emoji,
  tone,
  title,
  children,
}: {
  emoji: string;
  tone: "calm" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const colors = tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-stone-200 bg-white text-stone-700";
  return (
    <div className={`mt-6 rounded-2xl border p-6 text-center shadow-sm ${colors}`}>
      <div className="text-3xl">{emoji}</div>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
