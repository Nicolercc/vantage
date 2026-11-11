/** Where a part of the brief comes from. Every part says so next to its title. */
export type Kind = "sourced" | "background" | "retrieved";

const KIND_LABEL: Record<Kind, string> = {
	sourced: "From retrieved reporting",
	background: "Model background",
	retrieved: "Retrieved, not written by the model",
};

const KIND_HELP: Record<Kind, string> = {
	sourced: "Each statement quotes the numbered sources that say it; the quotes are checked against the sources.",
	background: "Written by the model from general knowledge; not individually sourced.",
	retrieved: "Fetched from news feeds, a news search and Wikipedia.",
};

export function KindTag({ kind }: { kind: Kind }) {
	return (
		<span className={`ci-kind ci-kind--${kind}`} title={KIND_HELP[kind]}>
			{KIND_LABEL[kind]}
		</span>
	);
}
