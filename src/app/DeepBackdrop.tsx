'use client';
import EmeraldShader from '../design-system/deep/EmeraldShader';

// THE DEEP · gen connect substrate. the rough-cut emerald (left) + ruby (right), GEN's stone.
// mounted once in the root layout; renders behind everything.
export default function DeepBackdrop() {
  // dim well down from the shader's own default ... behind a full working app the
  // emerald voronoi + ruby pool must READ AS A SUBSTRATE (the void, weight over noise),
  // not a loud crystalline field competing with the data. 0.9 drowned the content;
  // ~0.5 keeps the emerald-left / ruby-right character but lets it recede.
  return <EmeraldShader position="fixed" dim={0.5} />;
}
