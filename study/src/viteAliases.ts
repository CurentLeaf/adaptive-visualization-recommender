import path from 'node:path';

export function studyDependencyAliases(nodeModules: string) {
  return {
    react: path.join(nodeModules, 'react'),
    'react-dom': path.join(nodeModules, 'react-dom'),
    'lucide-react': path.join(nodeModules, 'lucide-react'),
    vega: path.join(nodeModules, 'vega'),
    'vega-embed': path.join(nodeModules, 'vega-embed'),
    'vega-lite': path.join(nodeModules, 'vega-lite'),
    zod: path.join(nodeModules, 'zod'),
    tailwindcss: path.join(nodeModules, 'tailwindcss/index.css'),
  };
}
