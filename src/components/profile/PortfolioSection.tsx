import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PortfolioItem } from '@/lib/types';
import { 
  Plus, 
  Image, 
  Link as LinkIcon, 
  Calendar, 
  Briefcase,
  Edit,
  Trash2,
  Star,
  ExternalLink,
  Move
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const portfolioItemSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  image_url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  category: z.string().optional(),
  date_completed: z.string().optional(),
  client: z.string().optional(),
  is_featured: z.boolean().default(false),
});

type PortfolioItemForm = z.infer<typeof portfolioItemSchema>;

interface PortfolioSectionProps {
  portfolioItems: PortfolioItem[];
  onAddItem: (item: Omit<PortfolioItem, 'id'>) => Promise<void>;
  onUpdateItem: (id: string, item: Partial<PortfolioItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

const PortfolioSection: React.FC<PortfolioSectionProps> = ({ 
  portfolioItems, 
  onAddItem, 
  onUpdateItem, 
  onDeleteItem 
}) => {
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<PortfolioItemForm>({
    resolver: zodResolver(portfolioItemSchema),
    defaultValues: {
      title: '',
      description: '',
      url: '',
      image_url: '',
      category: '',
      date_completed: '',
      client: '',
      is_featured: false,
    },
  });

  const handleEditItem = (item: PortfolioItem) => {
    setEditingItem(item);
    form.reset({
      title: item.title,
      description: item.description || '',
      url: item.url || '',
      image_url: item.image_url || '',
      category: item.category || '',
      date_completed: item.date_completed || '',
      client: item.client || '',
      is_featured: item.is_featured,
    });
    setShowItemDialog(true);
  };

  const handleAddItem = () => {
    setEditingItem(null);
    form.reset({
      title: '',
      description: '',
      url: '',
      image_url: '',
      category: '',
      date_completed: '',
      client: '',
      is_featured: false,
    });
    setShowItemDialog(true);
  };

  const onSubmit = async (data: PortfolioItemForm) => {
    setLoading(true);
    try {
      if (editingItem) {
        await onUpdateItem(editingItem.id, data);
        toast.success('Portfolio item updated successfully!');
      } else {
        await onAddItem(data);
        toast.success('Portfolio item added successfully!');
      }
      setShowItemDialog(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save portfolio item');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('Are you sure you want to delete this portfolio item?')) {
      try {
        await onDeleteItem(id);
        toast.success('Portfolio item deleted successfully!');
      } catch (error: any) {
        toast.error(error.message || 'Failed to delete portfolio item');
      }
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category?.toLowerCase()) {
      case 'video': return 'bg-blue-100 text-blue-800';
      case 'audio': return 'bg-purple-100 text-purple-800';
      case 'lighting': return 'bg-yellow-100 text-yellow-800';
      case 'event': return 'bg-green-100 text-green-800';
      case 'photography': return 'bg-pink-100 text-pink-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Portfolio</CardTitle>
            <CardDescription>
              Showcase your best work and projects
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleAddItem}>
            <Plus className="w-4 h-4 mr-2" />
            Add Project
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {portfolioItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {portfolioItems.map((item) => (
              <div 
                key={item.id} 
                className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow group"
              >
                {item.image_url ? (
                  <div className="relative h-40 bg-gray-100">
                    <img 
                      src={item.image_url} 
                      alt={item.title} 
                      className="w-full h-full object-cover"
                    />
                    {item.is_featured && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-yellow-100 text-yellow-800">
                          <Star className="h-3 w-3 mr-1 fill-yellow-500" />
                          Featured
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-40 bg-gray-100 flex items-center justify-center">
                    <Image className="h-12 w-12 text-gray-400" />
                    {item.is_featured && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-yellow-100 text-yellow-800">
                          <Star className="h-3 w-3 mr-1 fill-yellow-500" />
                          Featured
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium text-lg">{item.title}</h3>
                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => handleEditItem(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {item.category && (
                    <Badge className={getCategoryColor(item.category)} variant="secondary">
                      {item.category}
                    </Badge>
                  )}
                  
                  {item.description && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                    {item.client && (
                      <div className="flex items-center">
                        <Briefcase className="h-3 w-3 mr-1" />
                        {item.client}
                      </div>
                    )}
                    {item.date_completed && (
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {item.date_completed}
                      </div>
                    )}
                  </div>
                  
                  {item.url && (
                    <div className="mt-3">
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View Project
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No portfolio items yet</h3>
            <p className="text-gray-600 mb-4">
              Showcase your best work by adding portfolio items.
            </p>
            <Button onClick={handleAddItem}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Project
            </Button>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Portfolio Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={(open) => {
        setShowItemDialog(open);
        if (!open) {
          setEditingItem(null);
          form.reset();
        }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Portfolio Item' : 'Add Portfolio Item'}
            </DialogTitle>
            <DialogDescription>
              {editingItem 
                ? 'Update the details of your portfolio item.' 
                : 'Add a new project to your portfolio to showcase your work.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="title">Project Title*</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder="e.g., Corporate Event Video Production"
              />
              {form.formState.errors.title && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...form.register('description')}
                placeholder="Describe your role and the project..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select 
                  onValueChange={(value) => form.setValue('category', value)}
                  defaultValue={form.getValues('category')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Video">Video</SelectItem>
                    <SelectItem value="Audio">Audio</SelectItem>
                    <SelectItem value="Lighting">Lighting</SelectItem>
                    <SelectItem value="Event">Event</SelectItem>
                    <SelectItem value="Photography">Photography</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="client">Client</Label>
                <Input
                  id="client"
                  {...form.register('client')}
                  placeholder="e.g., TechCorp Events"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date_completed">Completion Date</Label>
                <Input
                  id="date_completed"
                  type="date"
                  {...form.register('date_completed')}
                />
              </div>

              <div>
                <Label htmlFor="url">Project URL</Label>
                <Input
                  id="url"
                  {...form.register('url')}
                  placeholder="https://example.com/project"
                />
                {form.formState.errors.url && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.url.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="image_url">Image URL</Label>
              <Input
                id="image_url"
                {...form.register('image_url')}
                placeholder="https://example.com/image.jpg"
              />
              {form.formState.errors.image_url && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.image_url.message}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Enter a URL for an image that represents this project
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_featured"
                checked={form.watch('is_featured')}
                onCheckedChange={(checked) => form.setValue('is_featured', checked)}
              />
              <Label htmlFor="is_featured">Feature this project on your profile</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowItemDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingItem ? 'Update Project' : 'Add Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default PortfolioSection;