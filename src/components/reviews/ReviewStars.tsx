import React from 'react';
import { Star } from 'lucide-react';

interface ReviewStarsProps {
  rating: number;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const ReviewStars: React.FC<ReviewStarsProps> = ({ 
  rating, 
  size = 'md', 
  showText = false,
  className = ''
}) => {
  // Determine star size based on the size prop
  const getStarSize = () => {
    switch (size) {
      case 'sm': return 'h-3 w-3';
      case 'lg': return 'h-6 w-6';
      default: return 'h-4 w-4';
    }
  };

  const starSize = getStarSize();

  return (
    <div className={`flex items-center ${className}`}>
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`${starSize} ${
            i < Math.floor(rating) 
              ? 'text-yellow-400 fill-yellow-400' 
              : i < rating 
                ? 'text-yellow-400 fill-yellow-400 opacity-50' 
                : 'text-gray-300'
          }`}
        />
      ))}
      
      {showText && (
        <span className="ml-2 text-sm font-medium text-gray-700">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
};

export default ReviewStars;