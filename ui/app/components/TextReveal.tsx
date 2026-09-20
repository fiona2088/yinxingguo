import { motion } from 'framer-motion';

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
}

export function TextReveal({ 
  text, 
  className = '',
  delay = 0,
  duration = 1
}: TextRevealProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      <motion.span 
        className="absolute inset-0 bg-gray-900 z-0"
        initial={{ x: 0, width: '100%' }}
        animate={{ x: '100%', width: 0 }}
        transition={{
          duration: duration,
          delay: delay,
          ease: "easeInOut"
        }}
      />
    </div>
  );
}
