import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StickyScrollSection } from './StickyScrollSection';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  DollarSign, 
  Building2, 
  Users, 
  TrendingUp, 
  CheckCircle,
  ArrowRight,
  Star,
  Zap,
  Shield,
  Clock
} from 'lucide-react';
import { useWaitlistStats } from '@/hooks/useWaitlistStats';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { total: waitlistCount } = useWaitlistStats();

  const features = [
    {
      icon: Calendar,
      title: 'Smart Scheduling',
      description: 'Unified calendar with conflict detection and automatic sync across all your connected companies.',
      color: 'text-blue-600'
    },
    {
      icon: DollarSign,
      title: 'Financial Tracking',
      description: 'Track earnings, expenses, and payments with detailed analytics and tax-ready reports.',
      color: 'text-green-600'
    },
    {
      icon: Building2,
      title: 'Company Integrations',
      description: 'Connect with major production companies like Rhino Staging, Giglife, and more.',
      color: 'text-purple-600'
    }
  ];

  const companies = [
    { name: 'Rhino Staging', logo: '🦏' },
    { name: 'Giglife', logo: '🎵' },
    { name: 'PCE', logo: '🌊' },
    { name: 'Stagehands Inc.', logo: '🎭' },
    { name: 'G2 Production', logo: '⚡' },
    { name: 'Onstage Systems', logo: '🎤' }
  ];

  const steps = [
    {
      number: '01',
      title: 'Create Your Profile',
      description: 'Set up your professional profile with skills, experience, and certifications.',
      icon: Users
    },
    {
      number: '02',
      title: 'Connect Companies',
      description: 'Link your accounts with production companies for seamless gig management.',
      icon: Building2
    },
    {
      number: '03',
      title: 'Manage Gigs',
      description: 'View all your gigs in one place with smart scheduling and conflict detection.',
      icon: Calendar
    },
    {
      number: '04',
      title: 'Track Earnings',
      description: 'Monitor payments, expenses, and generate reports for tax season.',
      icon: TrendingUp
    }
  ];

  const stats = [
    { number: '10,000+', label: 'Active Professionals' },
    { number: '50+', label: 'Partner Companies' },
    { number: '99.9%', label: 'Uptime' },
    { number: '$2M+', label: 'Payments Processed' }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">F</span>
              </div>
              <span className="text-xl font-bold text-gray-900">FlexZora</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/auth')}>
                Sign In
              </Button>
              <Button onClick={() => navigate('/auth?mode=signup')} className="bg-gradient-to-r from-blue-600 to-green-500">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section with Image Grid */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-green-50 py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-6">
                <Zap className="w-4 h-4 mr-2" />
                Trusted by 10,000+ professionals
              </div>
              <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Manage Your
                <span className="bg-gradient-to-r from-blue-600 to-green-500 bg-clip-text text-transparent"> Gigs </span>
                Like a Pro
              </h1>
              <p className="text-xl text-gray-600 mb-6 leading-relaxed">
                The all-in-one platform for freelance professionals in production and events. 
                Schedule gigs, track finances, and connect with top companies—all in one place.
              </p>
              <div className="mb-6">
                <Badge variant="outline" className="px-4 py-2 text-base font-medium bg-blue-50 border-blue-200 text-blue-700">
                  <Users className="w-4 h-4 mr-2" />
                  {waitlistCount.toLocaleString()} crew & companies already lined up
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button 
                  size="lg" 
                  onClick={() => navigate('/waitlist')}
                  className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-lg px-8 py-3"
                >
                  Join the Founding Crew
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => navigate('/auth')}
                  className="text-lg px-8 py-3"
                >
                  Sign In
                </Button>
              </div>
              <p className="mt-3 text-sm text-gray-500">Built for load-in, show call and load-out — for production companies and the crews they book.</p>
              <div className="flex items-center justify-center lg:justify-start mt-8 space-x-6 text-sm text-gray-500">
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                  Early access
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                  Exclusive pricing
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                  Shape the product
                </div>
              </div>
            </div>
            
            {/* Image Grid Showcase */}
            <div className="relative grid grid-cols-2 gap-4">
              {/* Main large image - Video Production */}
              <div className="col-span-2 relative group">
                <img 
                  src="https://images.pexels.com/photos/66134/pexels-photo-66134.jpeg?auto=compress&cs=tinysrgb&w=800" 
                  alt="Video production and camera work" 
                  className="w-full h-64 object-cover rounded-2xl shadow-xl group-hover:shadow-2xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-2xl"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-semibold text-lg">Video Production</h3>
                  <p className="text-sm opacity-90">Camera operators, directors, editors</p>
                </div>
              </div>
              
              {/* Sound Engineering */}
              <div className="relative group">
                <img 
                  src="https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=400" 
                  alt="Sound engineering and audio mixing" 
                  className="w-full h-48 object-cover rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl"></div>
                <div className="absolute bottom-3 left-3 text-white">
                  <h4 className="font-medium">Sound Engineering</h4>
                  <p className="text-xs opacity-90">Audio mixing, live sound</p>
                </div>
              </div>
              
              {/* Lighting Design */}
              <div className="relative group">
                <img 
                  src="https://images.pexels.com/photos/1190297/pexels-photo-1190297.jpeg?auto=compress&cs=tinysrgb&w=400" 
                  alt="Stage lighting and design" 
                  className="w-full h-48 object-cover rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl"></div>
                <div className="absolute bottom-3 left-3 text-white">
                  <h4 className="font-medium">Lighting Design</h4>
                  <p className="text-xs opacity-90">Stage lighting, LED systems</p>
                </div>
              </div>
              
              {/* Event Coordination */}
              <div className="col-span-2 relative group">
                <img 
                  src="https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg?auto=compress&cs=tinysrgb&w=800" 
                  alt="Event coordination and management" 
                  className="w-full h-40 object-cover rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl"></div>
                <div className="absolute bottom-3 left-3 text-white">
                  <h4 className="font-medium">Event Coordination</h4>
                  <p className="text-xs opacity-90">Project management, logistics, crew coordination</p>
                </div>
              </div>
              
              {/* Stage Management */}
              <div className="relative group">
                <img 
                  src="https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=400" 
                  alt="Stage management and setup" 
                  className="w-full h-32 object-cover rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl"></div>
                <div className="absolute bottom-2 left-2 text-white">
                  <h4 className="font-medium text-sm">Stage Management</h4>
                  <p className="text-xs opacity-90">Setup, rigging, safety</p>
                </div>
              </div>
              
              {/* Photography */}
              <div className="relative group">
                <img 
                  src="https://images.pexels.com/photos/1983032/pexels-photo-1983032.jpeg?auto=compress&cs=tinysrgb&w=400" 
                  alt="Professional photography" 
                  className="w-full h-32 object-cover rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-xl"></div>
                <div className="absolute bottom-2 left-2 text-white">
                  <h4 className="font-medium text-sm">Photography</h4>
                  <p className="text-xs opacity-90">Events, portraits, commercial</p>
                </div>
              </div>
              
              {/* Floating elements for visual interest */}
              <div className="absolute -top-4 -right-4 w-72 h-72 bg-gradient-to-r from-blue-400 to-green-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
              <div className="absolute -bottom-8 -left-4 w-72 h-72 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Professional Categories Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Built for Every Type of Professional
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From video production to event coordination, Flexora supports all types of gig work in the entertainment and production industry.
            </p>
            <Button 
              onClick={() => navigate('/waitlist')}
              className="mt-6 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              Join the Founding Crew
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/schedule-demo')}
              className="mt-4 md:mt-0 md:ml-4"
            >
              Schedule a Demo
            </Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { icon: '🎥', title: 'Video Production', desc: 'Camera ops, directors' },
              { icon: '🎵', title: 'Sound Engineering', desc: 'Audio mixing, live sound' },
              { icon: '💡', title: 'Lighting Design', desc: 'Stage lighting, LED' },
              { icon: '📸', title: 'Photography', desc: 'Events, commercial' },
              { icon: '🎭', title: 'Stage Management', desc: 'Setup, rigging' },
              { icon: '📋', title: 'Event Coordination', desc: 'Project management' }
            ].map((category, index) => (
              <div key={index} className="text-center group hover:scale-105 transition-transform duration-300">
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">
                  {category.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{category.title}</h3>
                <p className="text-sm text-gray-600">{category.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                  {stat.number}
                </div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <StickyScrollSection />

      {/* Core Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Everything you need to manage your freelance career
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From scheduling to payments, Flexora provides all the tools you need to succeed as a freelance professional.
            </p>
            <Button 
              onClick={() => navigate('/waitlist')}
              className="mt-6 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              Join the Founding Crew
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/schedule-demo')}
              className="mt-4 md:mt-0 md:ml-4"
            >
              Schedule a Demo
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
                <CardContent className="p-8 text-center">
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 ${feature.color} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Company Integrations */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Connect with industry leaders
            </h2>
            <p className="text-xl text-gray-600">
              Integrate with the production companies you already work with
            </p>
            <Button 
              onClick={() => navigate('/waitlist')}
              className="mt-6 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              Join the Founding Crew
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/schedule-demo')}
              className="mt-4 md:mt-0 md:ml-4"
            >
              Schedule a Demo
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center">
            {companies.map((company, index) => (
              <div key={index} className="text-center group">
                <div className="text-4xl mb-2 group-hover:scale-110 transition-transform duration-300">
                  {company.logo}
                </div>
                <div className="text-sm font-medium text-gray-600">{company.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Get started in minutes
            </h2>
            <p className="text-xl text-gray-600">
              Four simple steps to transform your freelance workflow
            </p>
            <Button 
              onClick={() => navigate('/waitlist')}
              className="mt-6 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600"
            >
              Join the Waitlist
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative text-center group">
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-green-500 text-white font-bold text-lg mb-6 group-hover:scale-110 transition-transform duration-300">
                    {step.number}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-blue-200 to-green-200"></div>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-green-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-6 h-6 text-yellow-300 fill-current" />
            ))}
          </div>
          <blockquote className="text-2xl lg:text-3xl font-medium text-white mb-8 leading-relaxed">
            "As a sound engineer working with multiple production companies, Flexora keeps me organized and ensures I never double-book. 
            My earnings have increased 40% since I started using it."
          </blockquote>
          <div className="flex items-center justify-center space-x-4">
            <img 
              src="https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100" 
              alt="Sarah Chen" 
              className="w-12 h-12 rounded-full"
            />
            <div className="text-left">
              <div className="text-white font-semibold">Sarah Chen</div>
              <div className="text-blue-100">Sound Engineer</div>
            </div>
          </div>
        </div>
      </section>

      {/* Fixed Waitlist Button */}
      <div className="fixed bottom-8 right-8 z-50">
        <Button
          onClick={() => navigate('/waitlist')}
          className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 shadow-lg animate-bounce"
        >
          Join the Founding Crew
        </Button>
      </div>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-6">
            Ready to take control of your freelance career?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of professionals who trust Flexora to manage their gigs and grow their business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => navigate('/waitlist')}
              className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-lg px-8 py-3"
            >
              Join the Founding Crew
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/schedule-demo')}
              className="text-lg px-8 py-3"
            >
              Schedule a Demo
            </Button>
          </div>
          <div className="flex items-center justify-center mt-6 space-x-6 text-sm text-gray-500">
            <div className="flex items-center">
              <Shield className="w-4 h-4 text-green-500 mr-2" />
              Enterprise-grade security
            </div>
            <div className="flex items-center">
              <Clock className="w-4 h-4 text-green-500 mr-2" />
              24/7 support
            </div>
          </div>
          
          {/* Waitlist Counter */}
          <div className="mt-8 text-center">
            <Badge variant="outline" className="px-4 py-2 text-base font-medium bg-blue-50 border-blue-200 text-blue-700">
              <Users className="w-4 h-4 mr-2" />
              {waitlistCount.toLocaleString()} crew & companies already lined up
            </Badge>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">F</span>
                </div>
                <span className="text-xl font-bold">Flexora</span>
              </div>
              <p className="text-gray-400 mb-4 max-w-md">
                The professional gig management platform for freelancers in production and events.
              </p>
              <div className="flex space-x-4">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  Privacy Policy
                </Button>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  Terms of Service
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 FlexZora. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;