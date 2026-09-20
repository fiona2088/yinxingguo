import { motion } from 'framer-motion';

interface TextSplitterProps {
  text: string;
  className?: string;
  letterClassName?: string;
  delay?: number;
  duration?: number;
}

export function TextSplitter({ 
  text, 
  className = '', 
  letterClassName = '',
  delay = 0,
  duration = 0.5
}: TextSplitterProps) {
  return (
    <span className={className}>
      {text.split('').map((letter, index) => (
        <motion.span 
          key={index} 
          className={`inline-block ${letterClassName}`}
          initial={{ opacity: 0, y: 20, rotateX: -90 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{
            duration: duration,
            delay: delay + index * 0.1,
            ease: "easeOut"
          }}
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </span>
  );
}
