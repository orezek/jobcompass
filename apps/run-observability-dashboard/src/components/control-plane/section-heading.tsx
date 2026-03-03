export function SectionHeading({
  eyebrow,
  title,
  description,
  detail,
}: {
  eyebrow: string;
  title: string;
  description: string;
  detail?: string;
}) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <div className="section-heading__row">
        <h2>{title}</h2>
        {detail ? <span className="section-heading__detail">{detail}</span> : null}
      </div>
      {description ? <p className="empty-copy">{description}</p> : null}
    </div>
  );
}
