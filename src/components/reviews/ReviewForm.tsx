import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { DatabaseService } from '@/lib/supabase';
import { Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  review_text: z.string().min(5, 'Review must be at least 5 characters').max(500, 'Review cannot exceed 500 characters'),
});

type ReviewFormData = z.infer<typeof reviewSchema>;

interface ReviewFormProps {
  workerId: string;
  gigId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const ReviewForm: React.FC<ReviewFormProps> = ({ 
  workerId, 
  gigId, 
  onSuccess, 
  onCancel 
}) => {
  const { profile } = useAuth();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 0,
      review_text: '',
    }
  });

  const onSubmit = async (data: ReviewFormData) => {
    if (!profile) {
      toast.error('You must be logged in to submit a review');
      return;
    }

    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setLoading(true);
    try {
      const reviewData = {
        reviewee_id: workerId,
        reviewer_id: profile.id,
        gig_id: gigId,
        rating,
        comment: data.review_text,
      };

      const { error } = await DatabaseService.addReview(reviewData);

      if (error) throw new Error(error);

      toast.success('Review submitted successfully!');
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error((error as Error).message || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Write a Review</CardTitle>
        <CardDescription>
          Share your experience working with this professional
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex items-center space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="focus:outline-none"
                  onClick={() => {
                    setRating(star);
                    setValue('rating', star, { shouldValidate: true });
                  }}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= (hoveredRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    } transition-colors`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-gray-600">
                {rating > 0 ? `${rating} star${rating !== 1 ? 's' : ''}` : 'Select a rating'}
              </span>
            </div>
            {rating === 0 && (
              <p className="text-sm text-red-600">Please select a rating</p>
            )}
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <Label htmlFor="review_text">Review</Label>
            <Textarea
              id="review_text"
              placeholder="Share details of your experience working with this professional..."
              rows={4}
              {...register('review_text')}
            />
            {errors.review_text && (
              <p className="text-sm text-red-600">{errors.review_text.message}</p>
            )}
          </div>

        </form>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSubmit(onSubmit)} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Review'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ReviewForm;