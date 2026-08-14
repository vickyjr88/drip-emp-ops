import { CardCarousel } from './card-carousel';
import { ServiceIcon, valueIconForIndex } from './service-icons';

export type ValueItem = { title: string; description: string };

/** Core values on the About page, four across on desktop. */
export function ValuesCarousel({ items }: { items: ValueItem[] }) {
  return (
    <CardCarousel label="Core values" perView={4} className="lp-values-carousel">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`} className="lp-value-card">
          <div className="lp-value-icon" aria-hidden="true">
            <ServiceIcon name={valueIconForIndex(index)} />
          </div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </article>
      ))}
    </CardCarousel>
  );
}
