import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  Plus, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Shield,
  User,
  Loader2 
} from 'lucide-react';

interface NCRAction {
  id: string;
  action_type: 'corrective' | 'preventive' | 'containment';
  description: string;
  assigned_to: string | null;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'verified';
  completed_at: string | null;
  completion_notes: string | null;
  verification_notes: string | null;
  verified_at: string | null;
  created_at: string;
  assignee?: { full_name: string } | null;
}

interface NCRActionManagerProps {
  ncrId: string;
  isQualityUser: boolean;
  isNCRClosed: boolean;
  onActionsUpdate?: () => void;
}

export function NCRActionManager({ 
  ncrId, 
  isQualityUser, 
  isNCRClosed,
  onActionsUpdate 
}: NCRActionManagerProps) {
  const [actions, setActions] = useState<NCRAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<NCRAction | null>(null);
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  
  const [newAction, setNewAction] = useState({
    action_type: 'corrective' as 'corrective' | 'preventive' | 'containment',
    description: '',
    assigned_to: '',
    due_date: ''
  });

  const [completionData, setCompletionData] = useState({
    completion_notes: '',
    verification_notes: ''
  });

  useEffect(() => {
    loadActions();
    loadPeople();
  }, [ncrId]);

  const loadActions = async () => {
    try {
      const { data, error } = await supabase
        .from('ncr_actions')
        .select(`
          *,
          assignee:assigned_to(full_name)
        `)
        .eq('ncr_id', ncrId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setActions((data as any[]) || []);
    } catch (error) {
      console.error('Error loading actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPeople = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name');
    setPeople(data || []);
  };

  const handleAddAction = async () => {
    if (!newAction.description.trim()) {
      toast.error('Please enter an action description');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('ncr_actions').insert({
        ncr_id: ncrId,
        action_type: newAction.action_type,
        description: newAction.description,
        assigned_to: newAction.assigned_to || null,
        assigned_by: user?.id,
        due_date: newAction.due_date || null
      });

      if (error) throw error;

      toast.success('Action added successfully');
      setShowAddDialog(false);
      setNewAction({ action_type: 'corrective', description: '', assigned_to: '', due_date: '' });
      loadActions();
      onActionsUpdate?.();
    } catch (error) {
      console.error('Error adding action:', error);
      toast.error('Failed to add action');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteAction = async () => {
    if (!selectedAction) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('ncr_actions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
          completion_notes: completionData.completion_notes
        })
        .eq('id', selectedAction.id);

      if (error) throw error;

      toast.success('Action marked as completed');
      setShowCompleteDialog(false);
      setSelectedAction(null);
      setCompletionData({ completion_notes: '', verification_notes: '' });
      loadActions();
      onActionsUpdate?.();
    } catch (error) {
      console.error('Error completing action:', error);
      toast.error('Failed to complete action');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAction = async (action: NCRAction) => {
    if (!isQualityUser) {
      toast.error('Only Quality users can verify actions');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('ncr_actions')
        .update({
          status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: user?.id
        })
        .eq('id', action.id);

      if (error) throw error;

      toast.success('Action verified');
      loadActions();
      onActionsUpdate?.();
    } catch (error) {
      console.error('Error verifying action:', error);
      toast.error('Failed to verify action');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1"><AlertTriangle className="h-3 w-3" /> In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case 'verified':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1"><Shield className="h-3 w-3" /> Verified</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'corrective':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Corrective</Badge>;
      case 'preventive':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">Preventive</Badge>;
      case 'containment':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Containment</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const allActionsVerified = actions.length > 0 && actions.every(a => a.status === 'verified');

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Actions & Assignments
          </CardTitle>
          {isQualityUser && !isNCRClosed && (
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Action
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading actions...</div>
          ) : actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No actions defined yet.</p>
              {isQualityUser && !isNCRClosed && (
                <p className="text-sm">Add corrective, preventive, or containment actions.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((action) => (
                  <TableRow key={action.id}>
                    <TableCell>{getTypeBadge(action.action_type)}</TableCell>
                    <TableCell className="max-w-xs">
                      <div className="truncate">{action.description}</div>
                      {action.completion_notes && (
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          Notes: {action.completion_notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {action.assignee?.full_name || (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {action.due_date 
                        ? format(new Date(action.due_date), 'dd MMM yyyy')
                        : '-'
                      }
                    </TableCell>
                    <TableCell>{getStatusBadge(action.status)}</TableCell>
                    <TableCell className="text-right">
                      {action.status === 'pending' && !isNCRClosed && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedAction(action);
                            setShowCompleteDialog(true);
                          }}
                        >
                          Complete
                        </Button>
                      )}
                      {action.status === 'completed' && isQualityUser && !isNCRClosed && (
                        <Button 
                          size="sm" 
                          onClick={() => handleVerifyAction(action)}
                          disabled={submitting}
                        >
                          Verify
                        </Button>
                      )}
                      {action.status === 'verified' && (
                        <CheckCircle className="h-4 w-4 text-green-600 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {actions.length > 0 && (
            <div className="mt-4 pt-4 border-t flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total:</span>
                <span className="ml-2 font-semibold">{actions.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Verified:</span>
                <span className="ml-2 font-semibold">{actions.filter(a => a.status === 'verified').length}</span>
              </div>
              {allActionsVerified && (
                <Badge className="bg-green-100 text-green-800">All Actions Verified</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Action Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Action</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Action Type</Label>
              <Select 
                value={newAction.action_type} 
                onValueChange={(v) => setNewAction(prev => ({ ...prev, action_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="containment">Containment Action</SelectItem>
                  <SelectItem value="corrective">Corrective Action</SelectItem>
                  <SelectItem value="preventive">Preventive Action</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description *</Label>
              <Textarea
                value={newAction.description}
                onChange={(e) => setNewAction(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the action to be taken..."
                rows={3}
              />
            </div>

            <div>
              <Label>Assign To</Label>
              <Select 
                value={newAction.assigned_to} 
                onValueChange={(v) => setNewAction(prev => ({ ...prev, assigned_to: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select person..." />
                </SelectTrigger>
                <SelectContent>
                  {people.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={newAction.due_date}
                onChange={(e) => setNewAction(prev => ({ ...prev, due_date: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddAction} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Action Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Action</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {selectedAction && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {getTypeBadge(selectedAction.action_type)}
                </div>
                <p className="text-sm">{selectedAction.description}</p>
              </div>
            )}

            <div>
              <Label>Completion Notes</Label>
              <Textarea
                value={completionData.completion_notes}
                onChange={(e) => setCompletionData(prev => ({ ...prev, completion_notes: e.target.value }))}
                placeholder="Describe what was done to complete this action..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>Cancel</Button>
            <Button onClick={handleCompleteAction} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
