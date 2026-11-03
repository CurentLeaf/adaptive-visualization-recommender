import path from 'node:path';

export function studyDependencyAliases(nodeModules: string) {
  return [
    { find: /^react$/, replacement: path.join(nodeModules, 'react') },
    { find: /^react-dom$/, replacement: path.join(nodeModules, 'react-dom') },
    { find: /^lucide-react$/, replacement: path.join(nodeModules, 'lucide-react') },
    { find: /^vega$/, replacement: path.join(nodeModules, 'vega') },
    { find: /^vega-embed$/, replacement: path.join(nodeModules, 'vega-embed') },
    { find: /^vega-lite$/, replacement: path.join(nodeModules, 'vega-lite') },
    { find: /^zod$/, replacement: path.join(nodeModules, 'zod') },
  ];
}
