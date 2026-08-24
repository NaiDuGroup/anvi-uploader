import { EDITOR_FONT_VARIABLE_CLASSES } from "@/lib/editor/editorNextFonts";

export default function MugLayout({ children }: { children: React.ReactNode }) {
  return <div className={EDITOR_FONT_VARIABLE_CLASSES.join(" ")}>{children}</div>;
}
