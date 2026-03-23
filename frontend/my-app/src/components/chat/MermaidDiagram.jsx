import React, { useEffect, useRef, useState, memo, useId } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;

const MermaidDiagram = memo(function MermaidDiagram({ chart }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const reactId = useId();
  const idRef = useRef(`mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      mermaidInitialized = true;
    }

    let cancelled = false;
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, chart.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Invalid diagram');
          setSvg('');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-medium text-amber-700 mb-2">Diagram could not be rendered</div>
        <pre className="text-xs text-amber-900 whitespace-pre-wrap">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 flex items-center justify-center p-8 rounded-lg border border-gray-200 bg-gray-50">
        <div className="text-sm text-gray-400">Rendering diagram...</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 rounded-lg border border-gray-200 bg-white p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

export default MermaidDiagram;
