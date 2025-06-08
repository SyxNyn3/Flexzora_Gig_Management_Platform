import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Send, 
  Users, 
  MessageSquare,
  MapPin,
  Clock,
  Shirt,
  Shield,
  Hotel,
  FileText,
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface GigMessage {
  id: string;
  gig_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'company' | 'worker';
  message_type: 'general' | 'instructions' | 'payment' | 'logistics' | 'safety';
  title: string;
  content: string;
  recipients: string[]; // 'all' or specific worker IDs
  priority: 'low' | 'medium' | 'high' | 'urgent';
  requires_confirmation: boolean;
  confirmations: { worker_id: string; confirmed_at: string }[];
  attachments?: string[];
  created_at: string;
}

interface GigCommunicationProps {
  gigId: string;
  gigTitle: string;
  workers: Array<{
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    status: 'accepted' | 'confirmed';
  }>;
}

const GigCommunication: React.FC<GigCommunicationProps> = ({ gigId, gigTitle, workers }) => {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<GigMessage[]>([]);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(['all']);
  const [messageType, setMessageType] = useState<string>('general');
  const [priority, setPriority] = useState<string>('medium');
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMockMessages();
  }, [gigId]);

  const loadMockMessages = () => {
    const mockMessages: GigMessage[] = [
      {
        id: '1',
        gig_id: gigId,
        sender_id: 'company-1',
        sender_name: 'Sarah Johnson',
        sender_role: 'company',
        message_type: 'instructions',
        title: 'Dress Code & Equipment Requirements',
        content: 'Please wear all black clothing (black pants, black shirt, black shoes). Bring your own safety gear including hard hat and safety vest. We will provide all camera equipment.',
        recipients: ['all'],
        priority: 'high',
        requires_confirmation: true,
        confirmations: [
          { worker_id: 'worker-1', confirmed_at: '2024-01-12T10:30:00Z' }
        ],
        created_at: '2024-01-10T09:00:00Z',
      },
      {
        id: '2',
        gig_id: gigId,
        sender_id: 'company-1',
        sender_name: 'Sarah Johnson',
        sender_role: 'company',
        message_type: 'logistics',
        title: 'Hotel Arrangements Confirmed',
        content: 'Your hotel accommodation has been booked at Marriott Downtown (123 Main St). Check-in: Jan 14, 3PM. Check-out: Jan 16, 11AM. Confirmation #: MR123456789. Breakfast included.',
        recipients: ['all'],
        priority: 'medium',
        requires_confirmation: true,
        confirmations: [],
        created_at: '2024-01-11T14:20:00Z',
      },
      {
        id: '3',
        gig_id: gigId,
        sender_id: 'company-1',
        sender_name: 'Sarah Johnson',
        sender_role: 'company',
        message_type: 'payment',
        title: 'Payment Schedule Update',
        content: 'Payment will be processed within 48 hours after gig completion. Rate confirmed at $45/hour. Overtime (after 8 hours) will be paid at $67.50/hour.',
        recipients: ['all'],
        priority: 'high',
        requires_confirmation: false,
        confirmations: [],
        created_at: '2024-01-12T11:15:00Z',
      },
      {
        id: '4',
        gig_id: gigId,
        sender_id: 'company-1',
        sender_name: 'Sarah Johnson',
        sender_role: 'company',
        message_type: 'safety',
        title: 'Safety Briefing - URGENT',
        content: 'MANDATORY safety briefing at 7:30 AM before start. Location: Main entrance. Topics: Equipment handling, emergency procedures, site hazards. Attendance required for all crew members.',
        recipients: ['all'],
        priority: 'urgent',
        requires_confirmation: true,
        confirmations: [
          { worker_id: 'worker-1', confirmed_at: '2024-01-13T08:00:00Z' }
        ],
        created_at: '2024-01-13T06:00:00Z',
      }
    ];

    setMessages(mockMessages);
  };

  const sendMessage = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const newMessage: GigMessage = {
        id: Date.now().toString(),
        gig_id: gigId,
        sender_id: profile?.id || 'demo',
        sender_name: profile?.full_name || 'Demo User',
        sender_role: profile?.role as 'company' | 'worker',
        message_type: messageType as any,
        title,
        content,
        recipients: selectedRecipients,
        priority: priority as any,
        requires_confirmation: requiresConfirmation,
        confirmations: [],
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [newMessage, ...prev]);
      setShowMessageDialog(false);
      resetForm();
      toast.success('Message sent successfully!');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const confirmMessage = async (messageId: string) => {
    if (!profile) return;

    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const existingConfirmation = msg.confirmations.find(c => c.worker_id === profile.id);
        if (!existingConfirmation) {
          return {
            ...msg,
            confirmations: [
              ...msg.confirmations,
              { worker_id: profile.id, confirmed_at: new Date().toISOString() }
            ]
          };
        }
      }
      return msg;
    }));

    toast.success('Message confirmed!');
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSelectedRecipients(['all']);
    setMessageType('general');
    setPriority('medium');
    setRequiresConfirmation(false);
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'instructions': return <FileText className="h-5 w-5" />;
      case 'payment': return <DollarSign className="h-5 w-5" />;
      case 'logistics': return <MapPin className="h-5 w-5" />;
      case 'safety': return <Shield className="h-5 w-5" />;
      default: return <MessageSquare className="h-5 w-5" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'instructions': return 'bg-purple-100 text-purple-800';
      case 'payment': return 'bg-green-100 text-green-800';
      case 'logistics': return 'bg-blue-100 text-blue-800';
      case 'safety': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isConfirmedByUser = (message: GigMessage) => {
    return message.confirmations.some(c => c.worker_id === profile?.id);
  };

  const getConfirmationStatus = (message: GigMessage) => {
    const totalWorkers = workers.length;
    const confirmedCount = message.confirmations.length;
    return { confirmed: confirmedCount, total: totalWorkers };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gig Communication</h2>
          <p className="text-gray-600 mt-2">
            Messages and updates for {gigTitle}
          </p>
        </div>
        {profile?.role === 'company' && (
          <Button onClick={() => setShowMessageDialog(true)}>
            <Send className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        )}
      </div>

      {/* Workers Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Team Members ({workers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {workers.map((worker) => (
              <div key={worker.id} className="flex items-center space-x-2 bg-gray-50 rounded-lg p-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={worker.avatar_url} />
                  <AvatarFallback>
                    {worker.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{worker.name}</p>
                  <Badge variant={worker.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
                    {worker.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((message) => {
          const confirmationStatus = getConfirmationStatus(message);
          const userConfirmed = isConfirmedByUser(message);

          return (
            <Card key={message.id} className={`${message.priority === 'urgent' ? 'border-red-300 bg-red-50' : ''}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded-lg ${getTypeColor(message.message_type)}`}>
                      {getMessageIcon(message.message_type)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold">{message.title}</h3>
                        <Badge className={getPriorityColor(message.priority)}>
                          {message.priority.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className={getTypeColor(message.message_type)}>
                          {message.message_type}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>From: {message.sender_name}</span>
                        <span>{format(new Date(message.created_at), 'MMM d, yyyy h:mm a')}</span>
                        <span>To: {message.recipients.includes('all') ? 'All team members' : `${message.recipients.length} members`}</span>
                      </div>
                    </div>
                  </div>
                  
                  {message.priority === 'urgent' && (
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <p className="text-gray-700 leading-relaxed mb-4">
                  {message.content}
                </p>

                {message.requires_confirmation && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-600">
                          Confirmations: {confirmationStatus.confirmed}/{confirmationStatus.total}
                        </span>
                        {profile?.role === 'worker' && (
                          userConfirmed ? (
                            <div className="flex items-center text-green-600">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              <span className="text-sm">Confirmed</span>
                            </div>
                          ) : (
                            <Button 
                              size="sm" 
                              onClick={() => confirmMessage(message.id)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Confirm Receipt
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                    
                    {message.confirmations.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-2">Confirmed by:</p>
                        <div className="flex flex-wrap gap-2">
                          {message.confirmations.map((confirmation) => {
                            const worker = workers.find(w => w.id === confirmation.worker_id);
                            return (
                              <div key={confirmation.worker_id} className="flex items-center space-x-1 bg-green-50 rounded px-2 py-1">
                                <CheckCircle className="h-3 w-3 text-green-600" />
                                <span className="text-xs text-green-800">
                                  {worker?.name || 'Unknown'} - {format(new Date(confirmation.confirmed_at), 'MMM d, h:mm a')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Send Message Dialog */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Send Message to Team</DialogTitle>
            <DialogDescription>
              Send instructions, updates, or important information to your team members
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="message_type">Message Type</Label>
                <Select value={messageType} onValueChange={setMessageType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="instructions">Instructions</SelectItem>
                    <SelectItem value="payment">Payment Info</SelectItem>
                    <SelectItem value="logistics">Logistics</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="recipients">Recipients</Label>
              <Select value={selectedRecipients[0]} onValueChange={(value) => setSelectedRecipients([value])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Members</SelectItem>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title">Subject</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Dress Code Requirements, Hotel Information"
              />
            </div>

            <div>
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter your message here..."
                rows={6}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="requires_confirmation"
                checked={requiresConfirmation}
                onChange={(e) => setRequiresConfirmation(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="requires_confirmation">Require confirmation from recipients</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMessageDialog(false)}>
              Cancel
            </Button>
            <Button onClick={sendMessage} disabled={loading}>
              {loading ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GigCommunication;