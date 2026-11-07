import { notFound } from 'next/navigation';

// Any URL under a valid locale that no real route claims is a 404. This
// catch-all exists so those unmatched paths render the localized not-found
// boundary (header/footer, direction and translations included) instead of
// Next's built-in English-only page. Unknown slugs inside real route
// segments (`/machines/...`, `/categories/...`, `/maintenance/...`) call
// `notFound()` from their own pages and land in the same boundary.
export default function CatchAllPage() {
  notFound();
}
