import { redirect } from 'next/navigation';

// Default landing for /admin/advertising — redirect to the creatives review queue.
export default function AdvertisingAdminPage() {
  redirect('/admin/advertising/creatives/review');
}
