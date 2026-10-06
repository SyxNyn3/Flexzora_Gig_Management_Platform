import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useReviewsForWorker } from '@/hooks/useSupabaseQuery';
import { Star, Building2, Briefcase } from 'lucide-react';
import { format } from 'date-fns';

interface ReviewsListProps {
  workerId: string;
  limit?: number;
}

const ReviewsList: React.FC<ReviewsListProps> = ({ workerId, limit }) => {
  const { data: reviews = [], loading, error } = useReviewsForWorker(workerId);
  
  // Limit the number of reviews if specified
  const displayedReviews = limit ? reviews.slice(0, limit) : reviews;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-red-600 dark:text-red-400">Error loading reviews: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (displayedReviews.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No reviews yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {displayedReviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <Avatar className="h-10 w-10">
                <AvatarImage src={review.reviewer?.avatar_url} />
                <AvatarFallback>
                  {review.reviewer?.full_name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{review.reviewer?.full_name}</h4>
                    <div className="flex items-center mt-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'
                          }`}
                        />
                      ))}
                      <span className="ml-2 text-sm text-muted-foreground">
                        {format(new Date(review.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  {review.reviewer?.role === 'company' && (
                    <Badge variant="outline" className="flex items-center">
                      <Building2 className="h-3 w-3 mr-1" />
                      Company
                    </Badge>
                  )}
                </div>
                
                {review.gig && (
                  <div className="flex items-center mt-2 text-sm text-muted-foreground">
                    <Briefcase className="h-4 w-4 mr-1" />
                    <span>For: {review.gig.title}</span>
                  </div>
                )}
                
                <p className="mt-3 text-foreground/80">{review.review_text}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ReviewsList;