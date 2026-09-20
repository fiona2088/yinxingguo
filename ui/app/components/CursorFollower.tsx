import { useState, useEffect, useRef } from 'react';

export function CursorFollower() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [trail, setTrail] = useState<{ x: number; y: number; opacity: number }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      
      // Add new trail point
      setTrail(prev => [
        { x: e.clientX, y: e.clientY, opacity: 1 },
        ...prev.slice(0, 5) // Keep only the last 5 trail points
      ]);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    // Update trail opacity
    const interval = setInterval(() => {
      setTrail(prev => 
        prev.map((point, index) => ({
          ...point,
          opacity: Math.max(0, point.opacity - 0.1)
        })).filter(point => point.opacity > 0)
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ 
        cursor: 'none',
      }}
    >
      {/* Trail */}
      {trail.map((point, index) => (
        <div
          key={index}
          className="absolute rounded-full bg-white/30 backdrop-blur-sm"
          style={{
            left: point.x - (5 - index) * 4,
            top: point.y - (5 - index) * 4,
            width: (5 - index) * 8,
            height: (5 - index) * 8,
            opacity: point.opacity,
            transition: 'opacity 0.1s ease',
          }}
        />
      ))}
      
      {/* Main cursor */}
      <div
        className="absolute rounded-full bg-white/50 backdrop-blur-md border border-white/20"
        style={{
          left: position.x - 8,
          top: position.y - 8,
          width: 16,
          height: 16,
          transition: 'transform 0.1s ease',
        }}
      />
    </div>
  );
}
