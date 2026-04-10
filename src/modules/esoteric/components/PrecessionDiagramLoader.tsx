'use client';

import dynamic from 'next/dynamic';

const PrecessionDiagram = dynamic(
  () => import('./PrecessionDiagram'),
  { ssr: false },
);

export default function PrecessionDiagramLoader() {
  return <PrecessionDiagram />;
}
