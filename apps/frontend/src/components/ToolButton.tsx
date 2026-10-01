/** Bouton d'une barre d'outils d'éditeur ; `active` : la mise en forme est appliquée à la sélection. */
export function ToolButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tool${active ? ' active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
