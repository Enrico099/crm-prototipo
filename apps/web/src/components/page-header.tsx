type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
      <div className="min-w-0">
        <h1 className="titulo-display text-[34px] sm:text-[40px] leading-[1.05] text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
