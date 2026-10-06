import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { CheckCircle, AlertTriangle, Loader2, ArrowRight, Copy, Twitter, Linkedin, Share2 } from 'lucide-react';
import { toast } from 'sonner';

const WaitlistVerification: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralStatus, setReferralStatus] = useState<{
    position: number;
    referral_count: number;
    beta_tester: boolean;
  } | null>(null);
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      if (!token || !email) {
        setError('Invalid verification link. Please check your email for the correct link.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: verifyError } = await supabase.functions.invoke('verify-waitlist-email', {
          body: { token, email },
        });

        if (verifyError) {
          throw new Error(verifyError.message);
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        if (data?.already_verified) {
          setAlreadyVerified(true);
        }

        setReferralCode(data?.referral_code);
        if (data?.referral_code) {
          const { data: status } = await supabase.rpc('waitlist_referral_status', { p_code: data.referral_code });
          setReferralStatus(status);
        }
        toast.success('Email verified successfully!');
      } catch (err: unknown) {
        console.error('Email verification error:', err);
        setError(err instanceof Error ? err.message : 'Failed to verify email');
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [searchParams]);

  const copyReferralLink = () => {
    if (!referralCode) return;

    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    toast.success('Referral link copied to clipboard!');
  };

  const shareOnTwitter = () => {
    if (!referralCode) return;

    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    const text = encodeURIComponent(
      `I just joined the waitlist for @FlexZora, a new platform for freelance professionals in production and events! Join me and get early access: ${link}`,
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const shareOnLinkedIn = () => {
    if (!referralCode) return;

    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    const url = encodeURIComponent(link);
    const title = encodeURIComponent('Join the FlexZora Waitlist');
    const summary = encodeURIComponent(
      'FlexZora is a new platform for freelance professionals in production and events. Join the waitlist for early access!',
    );
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`,
      '_blank',
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border-0">
            <CardContent className="pt-8 text-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Verifying your email...</h3>
              <p className="text-muted-foreground">Please wait while we confirm your email address.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-2xl font-bold">Verification Failed</CardTitle>
              <CardDescription className="text-lg">We couldn't verify your email address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>

              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  This could happen if the verification link has expired or has already been used.
                </p>
                <div className="flex flex-col space-y-2">
                  <Button onClick={() => navigate('/waitlist')}>Try Joining Again</Button>
                  <Button variant="outline" onClick={() => navigate('/')}>
                    Return to Home
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <Card className="shadow-xl border-0 animate-fade-in">
          <CardHeader className="text-center pb-6">
            <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {alreadyVerified ? 'Already Verified!' : 'Email Verified!'}
            </CardTitle>
            <CardDescription className="text-lg">
              {alreadyVerified
                ? 'Your email was already verified. Welcome back!'
                : 'Thank you for verifying your email address.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-green-500/10 p-6 rounded-lg border border-green-500/30">
              <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-3 flex items-center">
                <CheckCircle className="w-5 h-5 mr-2" />
                You're officially on the waitlist!
              </h3>
              <p className="text-green-600 dark:text-green-400 mb-4">
                We'll keep you updated on our progress and let you know when you get early access to FlexZora.
              </p>
            </div>

            {referralCode && (
              <div className="bg-primary/10 p-6 rounded-lg border border-primary/30">
                <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
                  <Share2 className="w-5 h-5 mr-2" />
                  Earn Priority Access
                </h3>
                <p className="text-primary mb-4">Share your unique referral link to move up in the waitlist faster!</p>
                {referralStatus && (
                  <div className="mb-4 text-blue-800">
                    <strong>You're #{referralStatus.position} in line</strong> · {referralStatus.referral_count}{' '}
                    referrals
                    {referralStatus.beta_tester && <Badge className="ml-2">Founding beta tester</Badge>}
                  </div>
                )}
                <div className="bg-card p-3 rounded-md flex items-center justify-between border border-primary/30 mb-4">
                  <code className="text-sm font-mono text-blue-800 truncate">
                    {window.location.origin}/waitlist?ref={referralCode}
                  </code>
                  <Button variant="ghost" size="sm" onClick={copyReferralLink}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copyReferralLink} className="flex-1">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Link
                  </Button>
                  <Button variant="outline" size="sm" onClick={shareOnTwitter} className="flex-1">
                    <Twitter className="w-4 h-4 mr-2" />
                    Twitter
                  </Button>
                  <Button variant="outline" size="sm" onClick={shareOnLinkedIn} className="flex-1">
                    <Linkedin className="w-4 h-4 mr-2" />
                    LinkedIn
                  </Button>
                </div>
              </div>
            )}

            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">What's Next?</h3>
              <p className="text-muted-foreground mb-4">
                Keep an eye on your inbox for exclusive updates and be ready for early access!
              </p>
              <Button onClick={() => navigate('/')} className="bg-gradient-to-r from-primary to-green-500">
                Return to Home
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WaitlistVerification;
