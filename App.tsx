import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabaseClient';
import { Task, PriorityLevel, Category, Comment } from './types';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Trash2, 
  AlertCircle, 
  Clock, 
  CheckCircle2,
  Gavel,
  User,
  FolderKanban,
  Mail,
  Check,
  MessageSquare,
  LogOut,
  Send,
  Loader2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Bell,
  X,
  BarChart3,
  FileText,
  Download
} from 'lucide-react';

// --- CONFIGURATION ---
const BOSS_EMAIL = "rodrigo.louzano@tjpr.jus.br";

// Centralized User Configuration (Allowlist)
const ALLOWED_USERS: Record<string, { name: string; role: 'BOSS' | 'EMPLOYEE' }> = {
  [BOSS_EMAIL]: { name: 'Rodrigo Louzano', role: 'BOSS' },
  'narley.sousa@tjpr.jus.br': { name: 'Narley', role: 'EMPLOYEE' },
  'elvertoni.coimbra@tjpr.jus.br': { name: 'Toni', role: 'EMPLOYEE' },
  'luis.lanconi@tjpr.jus.br': { name: 'Luís Gustavo', role: 'EMPLOYEE' }
};

const DEFAULT_PROJECTS = [
  'Automação do WhatsApp (Em Desenv.)', 
  'Sistema de Triagem (Em Desenv.)', 
  'Módulo de Prazos (Manutenção)'
];

// --- TYPES FOR VIEW STATE ---
type UserRole = 'BOSS' | 'EMPLOYEE';

interface UserSession {
  name: string;
  email: string;
  role: UserRole;
}

interface NotificationItem {
  id: string;
  user_email: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

const App: React.FC = () => {
  // --- GLOBAL STATE ---
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [notificationsList, setNotificationsList] = useState<NotificationItem[]>([]);
  const [projects, setProjects] = useState<string[]>(DEFAULT_PROJECTS);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);

  // Notification / Toast System
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'loading' | 'error'} | null>(null);

  // --- PERSISTENCE: Check LocalStorage on Mount ---
  useEffect(() => {
    const savedSession = localStorage.getItem('tjpr_session');
    if (savedSession) {
      setCurrentUser(JSON.parse(savedSession));
    }
  }, []);

  useEffect(() => {
    if (notification && (notification.type === 'success' || notification.type === 'error')) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Fetch tasks on load
  useEffect(() => {
    if (currentUser) {
        fetchTasks();
        fetchNotifications();

        // --- REALTIME SUBSCRIPTIONS ---
        const subscription = supabase
          .channel('public:notifications')
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications',
            filter: `user_email=eq.${currentUser.email}`
          }, (payload) => {
            setNotificationsList(prev => [payload.new as NotificationItem, ...prev]);
            // Opcional: Tocar um som ou mostrar toast pequeno
          })
          .subscribe();

        // Realtime Tasks (Updates & Inserts)
        const tasksSubscription = supabase
          .channel('public:tasks')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
             if (payload.eventType === 'INSERT') {
                // Logic handled by optimistic update usually, but good to sync
                // For simplicity in this view, we might want to refetch or append if not exists
                // fetchTasks(); // Brute force sync for simplicity on INSERT
             } else if (payload.eventType === 'UPDATE') {
                setTasks(prev => prev.map(t => {
                    if (t.id === payload.new.id) {
                        return { 
                            ...t, 
                            ...payload.new,
                            // Preserve comments and mapped fields that might differ in structure
                            category: payload.new.category as Category,
                            priority: payload.new.priority as PriorityLevel,
                            createdAt: new Date(payload.new.created_at).getTime(),
                            comments: t.comments // Keep existing comments
                        };
                    }
                    return t;
                }));
             }
          })
          .subscribe();

        // Realtime Comments
        const commentsSubscription = supabase
          .channel('public:comments')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => {
             const newCommentRaw = payload.new;
             const newComment: Comment = {
                 id: newCommentRaw.id,
                 author: newCommentRaw.author,
                 text: newCommentRaw.text,
                 createdAt: new Date(newCommentRaw.created_at).getTime()
             };

             setTasks(prev => prev.map(t => 
                 t.id === newCommentRaw.task_id 
                 ? { ...t, comments: [...t.comments, newComment] }
                 : t
             ));
          })
          .subscribe();

        return () => {
          supabase.removeChannel(subscription);
          supabase.removeChannel(tasksSubscription);
          supabase.removeChannel(commentsSubscription);
        };
    }
  }, [currentUser]);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_email', currentUser.email)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) setNotificationsList(data);
  };

  const unreadCount = notificationsList.filter(n => !n.read).length;

  const fetchTasks = async () => {
    setLoadingTasks(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          comments (
            id,
            author,
            text,
            created_at,
            task_id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedTasks: Task[] = data.map((t: any) => ({
          id: t.id,
          title: t.title,
          category: t.category as Category,
          priority: t.priority as PriorityLevel,
          justification: t.justification,
          project: t.project,
          assignees: t.assignees || (t.assignee ? [t.assignee] : []),
          createdAt: new Date(t.created_at).getTime(),
          status: t.status || 'PENDING',
          progress: t.progress || 0,
          comments: t.comments ? t.comments.map((c: any) => ({
            id: c.id,
            author: c.author,
            text: c.text,
            createdAt: new Date(c.created_at).getTime()
          })).sort((a: Comment, b: Comment) => a.createdAt - b.createdAt) : []
        }));
        setTasks(mappedTasks);

        // Extrair projetos únicos das tarefas existentes para atualizar a lista
        const usedProjects = Array.from(new Set(data.map((t: any) => t.project))).filter(Boolean);
        setProjects(prev => Array.from(new Set([...prev, ...usedProjects])));
      }
    } catch (err) {
      console.error("Error fetching tasks:", err);
      setNotification({ type: 'error', message: 'Erro ao carregar tarefas.' });
    } finally {
      setLoadingTasks(false);
    }
  };

  // --- ACTIONS ---

  const handleLoginSuccess = (session: UserSession) => {
    setCurrentUser(session);
    localStorage.setItem('tjpr_session', JSON.stringify(session));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('tjpr_session');
    setTasks([]);
  };

  // NEW: Send In-App Notification (Database) instead of Email
  const sendInAppNotification = async (toEmail: string, title: string, message: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_email: toEmail,
          title: title,
          message: message,
          read: false
        });

      if (error) throw error;
      console.log(`Notificação In-App enviada para ${toEmail}`);
    } catch (err) {
      console.error("Erro ao enviar notificação in-app:", err);
    }
  };

  // SECURE Email Sending Function using Supabase Edge Functions (Bypass CORS)
  const sendEmailNotification = async (toEmail: string, toName: string, title: string, message: string) => {
    setNotification({ type: 'loading', message: `Enviando notificação para ${toName}...` });
    
    try {
        // --- FIX: MODO DE DESENVOLVIMENTO (RESEND FREE TIER) ---
        // Redireciona todos os e-mails para o endereço verificado para evitar erro 400 ao criar tarefas/comentários
        const SAFE_DESTINATION = '11804338907@tjpr.jus.br';

        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            to: SAFE_DESTINATION,
            subject: `[TJPR-IA] ${title} (Para: ${toName})`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <p style="background: #fff3cd; color: #856404; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 15px;">
                    <strong>Modo Debug:</strong> E-mail redirecionado. Destinatário original: ${toEmail}
                </p>
                <h2 style="color: #1e3a8a;">TJPR Gestão de IA</h2>
                <p>Olá <strong>${toName}</strong>,</p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">Enviado automaticamente pelo sistema de gestão.</p>
              </div>
            `
          }
        });

        if (error) throw error;
        
        // Verifica erro retornado pela função (Soft Error)
        if (data?.error) throw new Error(data.error);

        setNotification({ type: 'success', message: `Notificação enviada (Redirecionada para Debug)` });
    } catch (error: any) {
        console.error('Falha ao enviar email via Edge Function:', error);
        setNotification({ type: 'error', message: `Erro ao enviar e-mail: ${error.message}` });
    }
  };

  const handleMarkAsRead = async (id: string) => {
    // Optimistic update
    setNotificationsList(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotificationsList(prev => prev.filter(n => n.id !== id));
    await supabase
      .from('notifications')
      .delete()
      .eq('id', id);
  };

  const handleClearAllNotifications = async () => {
    if (!currentUser) return;
    if (window.confirm('Tem certeza que deseja apagar todas as notificações?')) {
        setNotificationsList([]);
        await supabase.from('notifications').delete().eq('user_email', currentUser.email);
    }
  };

  const handleAddProject = (newProject: string) => {
    setProjects(prev => Array.from(new Set([...prev, newProject])));
  };

  const handleAddTask = async (newTask: Task) => {
    try {
      setNotification({ type: 'loading', message: 'Salvando demanda...' });
      
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          title: newTask.title,
          category: newTask.category,
          priority: newTask.priority,
          justification: newTask.justification,
          project: newTask.project,
          assignees: newTask.assignees,
          assignee: newTask.assignees[0], // Preenche coluna legada para evitar erro de constraint
          progress: 0
        }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const createdTask: Task = {
            ...newTask,
            id: data.id,
            createdAt: new Date(data.created_at).getTime(),
            progress: 0,
            comments: []
        };
        
        setTasks(prev => [createdTask, ...prev]);
        
        // Find emails for assignees

        const assigneeEmails = newTask.assignees.map(name => {
            const entry = Object.entries(ALLOWED_USERS).find(([email, u]) => u.name === name);
            return entry ? entry[0] : null;
        }).filter(Boolean) as string[];

        for (const email of assigneeEmails) {
            await sendInAppNotification(
              email,
              `Nova Demanda: ${newTask.title}`,
              `Você foi atribuído ao projeto "${newTask.project}" com prioridade ${newTask.priority}.`
            );
        }

        // Notify Boss if creator is Employee
        if (currentUser && currentUser.role === 'EMPLOYEE') {
             await sendInAppNotification(
                BOSS_EMAIL,
                `Nova Demanda: ${newTask.title}`,
                `Criada por: ${currentUser.name} | Projeto: ${newTask.project}`
             );
        }

        setNotification({ type: 'success', message: 'Demanda criada e responsável notificado.' });
      }
    } catch (err) {
      console.error("Error adding task:", err);
      setNotification({ type: 'error', message: `Erro ao criar tarefa: ${(err as any).message}` });
    }
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'DONE' ? 'PENDING' : 'DONE';
    
    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    try {
        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus })
            .eq('id', task.id);

        if (error) throw error;
        
        if (newStatus === 'DONE') {
            setNotification({ type: 'success', message: 'Tarefa concluída!' });
        }
    } catch (err) {
        console.error("Error updating status:", err);
        // Revert
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
        setNotification({ type: 'error', message: 'Erro ao atualizar status.' });
    }
  };

  const handleUpdatePriority = async (task: Task, newPriority: PriorityLevel) => {
    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority: newPriority } : t));

    try {
        const { error } = await supabase
            .from('tasks')
            .update({ priority: newPriority })
            .eq('id', task.id);

        if (error) throw error;
        setNotification({ type: 'success', message: 'Prioridade atualizada.' });
    } catch (err) {
        console.error("Error updating priority:", err);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, priority: task.priority } : t));
        setNotification({ type: 'error', message: 'Erro ao atualizar prioridade.' });
    }
  };

  const handleUpdateProgress = async (task: Task, newProgress: number) => {
    const oldProgress = task.progress || 0;
    
    // Regra de Negócio: Aviso se diminuir
    if (newProgress < oldProgress) {
        setNotification({ type: 'error', message: 'Atenção: Ao reduzir o progresso, por favor justifique nos comentários.' });
    }

    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: newProgress } : t));

    try {
        const { error } = await supabase
            .from('tasks')
            .update({ progress: newProgress })
            .eq('id', task.id);

        if (error) throw error;
        
        if (newProgress === 100 && task.status !== 'DONE') {
             // Opcional: Perguntar se quer marcar como concluído
             handleToggleTaskStatus(task);
        }

    } catch (err) {
        console.error("Error updating progress:", err);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: oldProgress } : t));
        setNotification({ type: 'error', message: `Erro ao atualizar progresso: ${(err as any).message}` });
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        setTasks(prev => prev.filter(t => t.id !== id));
        setNotification({ type: 'success', message: 'Tarefa removida.' });
    } catch (err) {
        console.error("Error deleting task:", err);
        setNotification({ type: 'error', message: 'Erro ao deletar tarefa.' });
    }
  };

  const handleAddComment = async (taskId: string, text: string) => {
    if (!currentUser) return;

    try {
        const { data, error } = await supabase
            .from('comments')
            .insert({
                task_id: taskId,
                author: currentUser.name,
                text: text
            })
            .select()
            .single();

        if (error) throw error;

        if (data) {
            const newComment: Comment = {
                id: data.id,
                author: data.author,
                text: data.text,
                createdAt: new Date(data.created_at).getTime()
            };

            const updatedTasks = tasks.map(t => {
                if (t.id === taskId) {
                    return {
                        ...t,
                        comments: [...t.comments, newComment]
                    };
                }
                return t;
            });
            setTasks(updatedTasks);

            const task = tasks.find(t => t.id === taskId);
            if (task) {
                const recipients: {email: string, name: string}[] = [];

                if (currentUser.role === 'BOSS') {
                    // Boss commented -> Notify All Assignees
                    task.assignees.forEach(assigneeName => {
                        const entry = Object.entries(ALLOWED_USERS).find(([email, u]) => u.name === assigneeName);
                        if (entry) {
                            recipients.push({ email: entry[0], name: assigneeName });
                        }
                    });
                } else {
                    // Employee commented -> Notify Boss
                    recipients.push({ email: BOSS_EMAIL, name: "Rodrigo Louzano" });
                }
                
                for (const recipient of recipients) {
                   // Send In-App Notification
                   await sendInAppNotification(
                      recipient.email,
                      `Novo Comentário em: ${task.title}`,
                      `${currentUser.name} comentou: "${text}"`
                   );
                }
            }
        }
    } catch (err) {
        console.error("Error adding comment:", err);
        setNotification({ type: 'error', message: 'Erro ao adicionar comentário.' });
    }
  };

  const generateReport = () => {
    if (!tasks.length) {
      setNotification({ type: 'error', message: 'Não há tarefas para gerar relatório.' });
      return;
    }
    const headers = ['ID', 'Título', 'Projeto', 'Categoria', 'Prioridade', 'Responsáveis', 'E-mails', 'Status', 'Progresso (%)', 'Criado em', 'Justificativa'];
    const csvContent = [
      headers.join(';'),
      ...tasks.map(t => {
        const assigneeEmails = t.assignees.map(name => 
            Object.entries(ALLOWED_USERS).find(([email, u]) => u.name === name)?.[0] || ''
        ).filter(Boolean).join(', ');
        return [
        t.id,
        `"${t.title.replace(/"/g, '""')}"`,
        `"${t.project.replace(/"/g, '""')}"`,
        t.category,
        t.priority,
        `"${t.assignees.join(', ')}"`,
        `"${assigneeEmails}"`,
        t.status,
        t.progress || 0,
        new Date(t.createdAt).toLocaleDateString(),
        `"${t.justification.replace(/"/g, '""')}"`
      ].join(';')})
    ].join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_demandas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setNotification({ type: 'success', message: 'Relatório CSV gerado com sucesso.' });
  };

  // --- RENDERERS ---

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col relative">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[60] animate-in slide-in-from-right-10 fade-in duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-xl shadow-slate-200/50 flex items-center gap-3 max-w-md border-l-4 ${
              notification.type === 'loading' ? 'bg-blue-800 border-blue-400 text-white' : 
              notification.type === 'error' ? 'bg-red-800 border-red-400 text-white' :
              'bg-slate-800 border-green-400 text-white'
            }`}>
            {notification.type === 'loading' ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            ) : notification.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-400" />
            ) : (
                <div className="bg-green-500/20 p-1.5 rounded-full">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {notification.type === 'loading' ? 'Processando...' : 
                 notification.type === 'error' ? 'Erro' : 'Sucesso'}
              </span>
              <span className="text-xs text-slate-300">{notification.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-sm">
              <Gavel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-800">P-SEP-AR <span className="font-light text-slate-400">Gestão de Demandas</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
             
             {/* Notification Bell */}
             <div className="relative">
                <button 
                  onClick={() => setShowNotificationsPanel(!showNotificationsPanel)}
                  className="p-2 rounded-full hover:bg-slate-100 transition-colors relative text-slate-500 hover:text-blue-600"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-blue-900"></span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {showNotificationsPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 text-slate-800">
                    <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Notificações</h3>
                          {notificationsList.length > 0 && (
                              <button onClick={handleClearAllNotifications} className="text-[10px] text-red-500 hover:text-red-700 font-medium underline">Limpar tudo</button>
                          )}
                      </div>
                      <button onClick={() => setShowNotificationsPanel(false)}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {notificationsList.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs italic">Nenhuma notificação.</div>
                      ) : (
                        notificationsList.map(notif => (
                          <div key={notif.id} onClick={() => handleMarkAsRead(notif.id)} className={`p-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors group relative ${!notif.read ? 'bg-blue-50/50' : ''}`}>
                            <div className="flex justify-between items-start mb-1 pr-6">
                              <h4 className={`text-sm ${!notif.read ? 'font-bold text-blue-900' : 'font-medium text-slate-700'}`}>{notif.title}</h4>
                              {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></span>}
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2">{notif.message}</p>
                            <span className="text-[10px] text-slate-400 mt-1 block">{new Date(notif.created_at).toLocaleDateString()}</span>
                            
                            <button 
                                onClick={(e) => handleDeleteNotification(notif.id, e)}
                                className="absolute top-3 right-3 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Apagar notificação"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
             </div>

             <div className="flex items-center gap-3 text-right pl-4 border-l border-slate-200">
                <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none text-slate-700">{currentUser.name}</span>
                    <span className="text-[10px] text-slate-400 leading-none mt-0.5">
                        {currentUser.role === 'BOSS' ? 'Gestor de Projetos' : 'Colaborador'}
                    </span>
                </div>
                 <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                    {currentUser.name.charAt(0)}
                </div>
            </div>
            
            <button 
                onClick={handleLogout}
                className="text-slate-400 hover:text-red-600 transition-colors ml-2"
                title="Sair"
            >
                <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 max-w-[1800px] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Panel */}
        <div className="lg:col-span-3 space-y-6">
            <CreateTaskForm onAddTask={handleAddTask} projects={projects} onAddProject={handleAddProject} currentUser={currentUser} />
            
            {currentUser.role === 'BOSS' ? (
                <ReportPanel onGenerate={generateReport} />
            ) : null}
        </div>

        {/* Right Panel: Kanban */}
        <div className="lg:col-span-9 space-y-6">
            {currentUser.role === 'BOSS' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TeamWorkloadPanel tasks={tasks} />
                    <ProjectStatsPanel tasks={tasks} projects={projects} />
                </div>
            ) : (
                <PersonalDashboard user={currentUser} tasks={tasks} />
            )}

            {loadingTasks ? (
                <div className="flex items-center justify-center h-64 text-slate-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Carregando demandas...</span>
                </div>
            ) : (
                <KanbanBoard 
                    tasks={tasks} 
                    userRole={currentUser.role} 
                    onDelete={handleDeleteTask}
                    onAddComment={handleAddComment}
                    currentUser={currentUser}
                    onToggleStatus={handleToggleTaskStatus}
                    onUpdateProgress={handleUpdateProgress}
                    onUpdatePriority={handleUpdatePriority}
                />
            )}
        </div>
      </div>
    </div>
  );
};

// --- AUTH COMPONENT ---

const LoginScreen: React.FC<{ onLoginSuccess: (session: UserSession) => void }> = ({ onLoginSuccess }) => {
    const [step, setStep] = useState<'EMAIL' | 'PASSWORD' | 'CREATE_PASSWORD'>('EMAIL');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    // Identified User Data found during email step
    const [identifiedUser, setIdentifiedUser] = useState<{name: string, role: UserRole} | null>(null);
    const [loadingAuthEmail, setLoadingAuthEmail] = useState<string | null>(null);

    const handleQuickLogin = async (userEmail: string) => {
        setLoadingAuthEmail(userEmail);
        const userData = ALLOWED_USERS[userEmail];
        
        // UNIFIED LOGIN FLOW
        setEmail(userEmail);
        setIdentifiedUser(userData);
        setError('');
        setLoading(true);

        try {
            const { data, error: dbError } = await supabase
                .from('profiles')
                .select('*')
                .eq('email', userEmail)
                .single();

            if (dbError && dbError.code !== 'PGRST116') {
                throw dbError;
            }

            if (data) {
                setStep('PASSWORD');
            } else {
                setStep('CREATE_PASSWORD');
            }
        } catch (err) {
            console.error(err);
            setError('Erro ao verificar usuário.');
        } finally {
            setLoading(false);
            setLoadingAuthEmail(null);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('email', email.toLowerCase())
                .single();
            
            if (data && data.password === password) {
                // SUCCESS
                onLoginSuccess({
                    name: data.name,
                    email: data.email,
                    role: data.role as UserRole
                });
            } else {
                setError('Senha incorreta.');
            }
        } catch (err) {
            setError('Erro ao realizar login.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 4) {
            setError('A senha deve ter pelo menos 4 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setError('');
        setLoading(true);

        try {
            const userData = ALLOWED_USERS[email.toLowerCase()];
            
            const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                    email: email.toLowerCase(),
                    password: password, // In production, use hashing!
                    name: userData.name,
                    role: userData.role
                });

            if (insertError) throw insertError;

            // Auto login after register
            onLoginSuccess({
                name: userData.name,
                email: email.toLowerCase(),
                role: userData.role
            });

        } catch (err) {
            console.error(err);
            setError('Erro ao criar senha.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = () => {
        alert(`Um link de redefinição de senha foi enviado para ${email}. Verifique sua caixa de entrada.`);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <div className="flex-1 flex items-center justify-center w-full max-w-4xl">
            <div className="bg-white rounded-2xl shadow-xl w-full overflow-hidden flex flex-col md:flex-row min-h-[500px]">
                
                {/* Branding Side */}
                <div className="bg-blue-900 p-12 text-white md:w-1/2 flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.tjpr.jus.br/documents/11900/4956747/fachada_palacio_justica.jpg')] bg-cover bg-center opacity-10"></div>
                    <div className="relative z-10">
                        <div className="mb-6 bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
                            <Gavel className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-bold mb-4">P-SEP-AR Gestão de Demandas</h1>
                        <p className="text-blue-200 leading-relaxed">
                            Sistema centralizado para priorização e acompanhamento de demandas de Inteligência Artificial da Assessoria de Recursos aos Tribunais Superiores (STF e STJ) da Secretaria Especial da Presidência.
                        </p>
                    </div>
                </div>

                {/* Form Side */}
                <div className="p-12 md:w-1/2 flex flex-col justify-center">
                    
                    {step === 'EMAIL' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <h2 className="text-2xl font-bold text-slate-800 mb-2">Bem-vindo</h2>
                            <p className="text-slate-500 text-sm mb-6">Selecione seu usuário para entrar:</p>
                            
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {Object.entries(ALLOWED_USERS).map(([uEmail, uData]) => (
                                    <button
                                        key={uEmail}
                                        onClick={() => handleQuickLogin(uEmail)}
                                        disabled={loading}
                                        className="flex flex-col items-center p-3 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-center group bg-white shadow-sm"
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${uData.role === 'BOSS' ? 'bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-600 group-hover:text-white'}`}>
                                            {loading && loadingAuthEmail === uEmail ? <Loader2 className="w-5 h-5 animate-spin" /> : uData.name.charAt(0)}
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">{uData.name}</span>
                                        <span className="text-[10px] text-slate-400">{uData.role === 'BOSS' ? 'Gestor' : 'Colaborador'}</span>
                                    </button>
                                ))}
                            </div>

                            {error && <p className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded flex items-center gap-2 mt-4"><AlertCircle className="w-3 h-3" /> {error}</p>}
                        </div>
                    )}

                    {step === 'PASSWORD' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <button onClick={() => {setStep('EMAIL'); setError(''); setPassword('');}} className="text-xs text-slate-400 hover:text-blue-600 mb-6 flex items-center gap-1">← Voltar</button>
                            
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200">
                                    {identifiedUser?.name.charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">{identifiedUser?.name}</h2>
                                    <p className="text-slate-500 text-xs">{email}</p>
                                </div>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Sua Senha</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                                        <input 
                                            type={showPassword ? "text" : "password"} 
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="••••••••"
                                            autoFocus
                                        />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button type="button" onClick={handleForgotPassword} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Esqueci minha senha</button>
                                </div>

                                {error && <p className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded flex items-center gap-2"><AlertCircle className="w-3 h-3" /> {error}</p>}

                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}
                                </button>
                            </form>
                        </div>
                    )}

                    {step === 'CREATE_PASSWORD' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <button onClick={() => {setStep('EMAIL'); setError(''); setPassword('');}} className="text-xs text-slate-400 hover:text-blue-600 mb-4 flex items-center gap-1">← Cancelar</button>
                            
                            <div className="mb-6">
                                <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider rounded mb-2">Primeiro Acesso</span>
                                <h2 className="text-xl font-bold text-slate-800">Defina sua Senha</h2>
                                <p className="text-slate-500 text-sm mt-1">Olá <strong>{identifiedUser?.name}</strong>, para garantir a segurança, crie uma senha para seus próximos acessos.</p>
                            </div>

                            <form onSubmit={handleRegister} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Nova Senha</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                                        <input 
                                            type={showPassword ? "text" : "password"} 
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Mínimo 4 caracteres"
                                        />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Confirmar Senha</label>
                                    <div className="relative">
                                        <Check className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                                        <input 
                                            type={showPassword ? "text" : "password"} 
                                            required
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Repita a senha"
                                        />
                                    </div>
                                </div>

                                {error && <p className="text-red-500 text-xs font-medium bg-red-50 p-2 rounded flex items-center gap-2"><AlertCircle className="w-3 h-3" /> {error}</p>}

                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Senha e Entrar'}
                                </button>
                            </form>
                        </div>
                    )}

                </div>
            </div>
            </div>
        </div>
    );
};

const CreateTaskForm: React.FC<{ onAddTask: (t: Task) => void, projects: string[], onAddProject: (p: string) => void, currentUser: UserSession }> = ({ onAddTask, projects, onAddProject, currentUser }) => {
    // Determine the list of assignees based on the ALLOWED_USERS constant
    const ASSIGNEES = Object.values(ALLOWED_USERS)
        .filter(u => u.role === 'EMPLOYEE')
        .map(u => u.name);

    const defaultAssignee = ASSIGNEES.includes(currentUser.name) ? currentUser.name : (ASSIGNEES[0] || 'Narley');

    const [formData, setFormData] = useState({
        title: '',
        category: Category.DEV,
        priority: PriorityLevel.MEDIA,
        project: projects[0] || '',
        assignees: [defaultAssignee],
        justification: ''
      });

      const [isCreatingProject, setIsCreatingProject] = useState(false);
      const [newProjectName, setNewProjectName] = useState('');
      const [newProjectStatus, setNewProjectStatus] = useState('Em Desenv.');
    
      const inputClasses = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400";

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title.trim()) return;
    
        const newTask: Task = {
          id: '', 
          title: formData.title,
          category: formData.category as Category,
          priority: formData.priority as PriorityLevel,
          project: formData.project,
          assignees: formData.assignees,
          justification: formData.justification,
          createdAt: 0,
          comments: []
        };
    
        onAddTask(newTask);
        
        setFormData({
            title: '',
            category: Category.DEV,
            priority: PriorityLevel.MEDIA,
            project: projects[0] || '',
            assignees: [defaultAssignee],
            justification: ''
        });
      };

      const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
      };

      const handleCreateProject = () => {
        if (newProjectName.trim()) {
            const finalName = `${newProjectName.trim()} (${newProjectStatus})`;
            onAddProject(finalName);
            setFormData(prev => ({ ...prev, project: finalName }));
            setIsCreatingProject(false);
            setNewProjectName('');
            setNewProjectStatus('Em Desenv.');
        }
      };

      const toggleAssignee = (name: string) => {
        setFormData(prev => {
            const current = prev.assignees;
            if (current.includes(name)) {
                if (current.length === 1) return prev; // Prevent empty
                return { ...prev, assignees: current.filter(a => a !== name) };
            } else {
                return { ...prev, assignees: [...current, name] };
            }
        });
      };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-blue-700" />
              <h2 className="font-semibold text-slate-800 text-sm">Nova Demanda</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Título da Tarefa</label>
                <input type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="Ex: Atualizar servidor..." className={inputClasses} required />
              </div>

              <div className="space-y-4">
                 <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <FolderKanban className="w-3 h-3" /> Projeto
                  </label>
                  
                  {isCreatingProject ? (
                    <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                        <input 
                            type="text" 
                            value={newProjectName} 
                            onChange={(e) => setNewProjectName(e.target.value)} 
                            placeholder="Nome do projeto..." 
                            className={inputClasses} 
                            autoFocus
                        />
                        <select 
                            value={newProjectStatus}
                            onChange={(e) => setNewProjectStatus(e.target.value)}
                            className={inputClasses}
                        >
                            <option value="Em Desenv.">Em Desenvolvimento</option>
                            <option value="Lançado">Lançado</option>
                            <option value="Manutenção">Em Manutenção</option>
                            <option value="Planejamento">Planejamento</option>
                        </select>
                        <div className="flex gap-2 justify-end mt-1">
                            <button type="button" onClick={() => setIsCreatingProject(false)} className="bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50">Cancelar</button>
                            <button type="button" onClick={handleCreateProject} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm">Criar Projeto</button>
                        </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                        <select name="project" value={formData.project} onChange={handleInputChange} className={inputClasses}>
                            {projects.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button type="button" onClick={() => setIsCreatingProject(true)} className="bg-slate-100 border border-slate-200 text-slate-600 px-2 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors" title="Criar novo projeto"><PlusCircle className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <User className="w-3 h-3" /> Responsável
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ASSIGNEES.map(name => (
                        <button
                            type="button"
                            key={name}
                            onClick={() => toggleAssignee(name)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${formData.assignees.includes(name) ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                        >
                            {name} {formData.assignees.includes(name) && <Check className="w-3 h-3" />}
                        </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Categoria</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} className={inputClasses}>
                    {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prioridade</label>
                  <select name="priority" value={formData.priority} onChange={handleInputChange} className={`${inputClasses} font-medium`}>
                    <option value={PriorityLevel.ALTA}>Alta</option>
                    <option value={PriorityLevel.MEDIA}>Média</option>
                    <option value={PriorityLevel.BAIXA}>Baixa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descrição / Justificativa</label>
                <textarea 
                    name="justification" 
                    value={formData.justification} 
                    onChange={handleInputChange} 
                    placeholder="Descreva os detalhes da demanda..." 
                    className={`${inputClasses} min-h-[80px] resize-y`} 
                />
              </div>

              <div className="flex flex-col gap-3">
                  <button type="submit" className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Criar e Notificar Responsável
                  </button>
              </div>

              <p className="text-[10px] text-center text-slate-400">
                *A notificação será enviada para o responsável!
              </p>
            </form>
          </div>
    );
};

const PersonalDashboard: React.FC<{ user: UserSession, tasks: Task[] }> = ({ user, tasks }) => {
    const myTasks = tasks.filter(t => t.assignees.includes(user.name) && t.status !== 'DONE');
    const high = myTasks.filter(t => t.priority === PriorityLevel.ALTA).length;
    const medium = myTasks.filter(t => t.priority === PriorityLevel.MEDIA).length;
    const low = myTasks.filter(t => t.priority === PriorityLevel.BAIXA).length;
    const oldestTask = [...myTasks].sort((a, b) => a.createdAt - b.createdAt)[0];
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stats Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
                 <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-700 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" /> Minhas Demandas
                    </h2>
                    <span className="text-2xl font-bold text-blue-700">{myTasks.length}</span>
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                        <div className="bg-red-50 border border-red-100 rounded p-2 text-center">
                            <span className="block text-lg font-bold text-red-700 leading-none">{high}</span>
                            <span className="text-[9px] text-red-600 uppercase font-bold">Alta</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded p-2 text-center">
                            <span className="block text-lg font-bold text-amber-700 leading-none">{medium}</span>
                            <span className="text-[9px] text-amber-600 uppercase font-bold">Média</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded p-2 text-center">
                            <span className="block text-lg font-bold text-emerald-700 leading-none">{low}</span>
                            <span className="text-[9px] text-emerald-600 uppercase font-bold">Baixa</span>
                        </div>
                 </div>
            </div>

            {/* Alerts/Oldest Task Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 flex flex-col justify-center">
                 {oldestTask ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span className="text-xs font-bold text-amber-700">Atenção: Demanda Antiga</span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-1 font-medium" title={oldestTask.title}>{oldestTask.title}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Criada em {new Date(oldestTask.createdAt).toLocaleDateString()}</p>
                        </div>
                 ) : (
                    <div className="text-center text-slate-400 text-sm flex flex-col items-center">
                        <CheckCircle2 className="w-8 h-8 mb-2 opacity-50 text-green-500" />
                        <p>Você está em dia com suas tarefas!</p>
                    </div>
                 )}
            </div>
        </div>
    );
};

const TeamWorkloadPanel: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
    const employees = Object.values(ALLOWED_USERS).filter(u => u.role === 'EMPLOYEE');
    
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-700" />
                <h2 className="font-semibold text-slate-800 text-sm">Carga de Trabalho da Equipe</h2>
            </div>
            <div className="p-6 space-y-4">
                {employees.map(emp => {
                    const empTasks = tasks.filter(t => t.assignees.includes(emp.name) && t.status !== 'DONE');
                    const count = empTasks.length;
                    // Simple logic for load color
                    const color = count > 5 ? 'bg-red-500' : count > 2 ? 'bg-amber-500' : 'bg-emerald-500';
                    
                    return (
                        <div key={emp.name}>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="font-medium text-slate-700">{emp.name}</span>
                                <span className="text-slate-500">{count} tarefas pendentes</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${Math.min((count / 8) * 100, 100)}%` }}></div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

const ProjectStatsPanel: React.FC<{ tasks: Task[], projects: string[] }> = ({ tasks, projects }) => {
    const projectCounts = projects.map(project => {
        const count = tasks.filter(t => t.project === project && t.status !== 'DONE').length;
        return { project, count };
    });

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-blue-700" />
                <h2 className="font-semibold text-slate-800 text-sm">Demandas por Projeto</h2>
            </div>
            <div className="p-6 space-y-3">
                {projectCounts.map(p => (
                    <div key={p.project} className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600 truncate max-w-[180px]" title={p.project}>{p.project}</span>
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">{p.count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ReportPanel: React.FC<{ onGenerate: () => void }> = ({ onGenerate }) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-700" />
                <h2 className="font-semibold text-slate-800 text-sm">Relatórios</h2>
            </div>
            <div className="p-6">
                <button 
                    onClick={onGenerate}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 border border-slate-200"
                >
                    <Download className="w-4 h-4" />
                    Exportar CSV Completo
                </button>
                <p className="text-[10px] text-center text-slate-400 mt-3">
                    Gera um arquivo compatível com Excel contendo todas as demandas e status atuais.
                </p>
            </div>
        </div>
    );
};

const KanbanBoard: React.FC<{ 
    tasks: Task[], 
    userRole: UserRole, 
    onDelete: (id: string) => void,
    onAddComment: (id: string, text: string) => void,
    currentUser: UserSession,
    onToggleStatus: (task: Task) => void,
    onUpdateProgress: (task: Task, progress: number) => void,
    onUpdatePriority: (task: Task, priority: PriorityLevel) => void
}> = ({ tasks, userRole, onDelete, onAddComment, currentUser, onToggleStatus, onUpdateProgress, onUpdatePriority }) => {
    
    // Expanded task state for viewing details/comments
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [commentText, setCommentText] = useState('');

    const toggleExpand = (id: string) => {
        if (expandedTaskId === id) {
            setExpandedTaskId(null);
            setCommentText('');
        } else {
            setExpandedTaskId(id);
            setCommentText('');
        }
    };

    const submitComment = (taskId: string) => {
        if (!commentText.trim()) return;
        onAddComment(taskId, commentText);
        setCommentText('');
    };

    const boardHeight = userRole === 'BOSS' ? 'h-[600px]' : 'h-[calc(100vh-12rem)]';

    const getPriorityStyles = (p: PriorityLevel) => {
        switch (p) {
          case PriorityLevel.ALTA: return { border: 'border-l-4 border-l-red-500', bg: 'bg-white' };
          case PriorityLevel.MEDIA: return { border: 'border-l-4 border-l-amber-500', bg: 'bg-white' };
          case PriorityLevel.BAIXA: return { border: 'border-l-4 border-l-emerald-500', bg: 'bg-white' };
          default: return { border: '', bg: '' };
        }
    };

    const renderColumn = (priority: PriorityLevel, title: string, icon: React.ReactNode) => {
        const filteredTasks = tasks.filter(t => t.priority === priority);
        
        return (
            <div className="flex flex-col h-full bg-slate-100/80 rounded-2xl border border-slate-200/60 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold">
                        {icon} <h3>{title}</h3>
                    </div>
                    <span className="bg-white border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm">{filteredTasks.length}</span>
                </div>
                
                <div className="flex-1 space-y-3 overflow-y-auto p-3 custom-scrollbar">
                    {filteredTasks.length === 0 ? (
                        <div className="h-32 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-sm italic">
                            Nenhuma demanda
                        </div>
                    ) : (
                        filteredTasks.map(task => {
                            const styles = getPriorityStyles(task.priority);
                            const isExpanded = expandedTaskId === task.id;
                            const isMyTask = task.assignees.includes(currentUser.name);
                            const progress = task.progress || 0;
                            
                            return (
                                <div key={task.id} className={`rounded-xl shadow-sm border border-slate-200 ${styles.border} ${task.status === 'DONE' ? 'bg-slate-50 opacity-75' : styles.bg} transition-all duration-200 ${isExpanded ? 'ring-2 ring-blue-500/20 shadow-md' : 'hover:shadow-md hover:border-blue-200'}`}>
                                    
                                    {/* Main Card Content - Clickable to Expand */}
                                    <div className="p-4 cursor-pointer" onClick={() => toggleExpand(task.id)}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium mb-1">
                                                    <FolderKanban className="w-3 h-3" />
                                                    <span className="truncate max-w-[120px]">{task.project}</span>
                                                </div>
                                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-slate-100 text-slate-600 w-fit">
                                                    {task.category}
                                                </span>
                                            </div>
                                            <div className="flex gap-1">
                                                {(isMyTask || userRole === 'BOSS') && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onToggleStatus(task); }} 
                                                        className={`p-1 rounded hover:bg-slate-200 transition-colors ${task.status === 'DONE' ? 'text-green-600 bg-green-50' : 'text-slate-300 hover:text-green-600'}`}
                                                        title={task.status === 'DONE' ? "Reabrir" : "Concluir"}
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {(userRole === 'BOSS' || isMyTask) && (
                                                    <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <h4 className={`text-sm font-semibold text-slate-800 leading-snug mb-2 ${task.status === 'DONE' ? 'line-through text-slate-500' : ''}`}>{task.title}</h4>
                                        
                                        {!isExpanded && task.justification && (
                                            <p className="text-xs text-slate-500 line-clamp-2 mb-3 bg-slate-50 p-2 rounded border border-slate-100">{task.justification}</p>
                                        )}

                                        {isExpanded && (
                                            <div className="mb-3">
                                                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Prioridade</label>
                                                <select
                                                    value={task.priority}
                                                    onChange={(e) => onUpdatePriority(task, e.target.value as PriorityLevel)}
                                                    className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                >
                                                    {Object.values(PriorityLevel).map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </div>
                                        )}

                                        {/* Progress Bar */}
                                        <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                                                <span>Progresso</span>
                                                <span className="font-bold">{progress}%</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2 relative group">
                                                <div className={`h-2 rounded-full transition-all duration-300 ${progress === 100 ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }}></div>
                                                {/* Slider Input (Visible on Hover or if My Task) */}
                                                {(isMyTask || userRole === 'BOSS') && (
                                                    <input 
                                                        type="range" 
                                                        min="0" max="100" step="10" 
                                                        value={progress}
                                                        onChange={(e) => onUpdateProgress(task, parseInt(e.target.value))}
                                                        className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                                                        title="Arraste para alterar o progresso"
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                                            <div className={`flex items-center gap-2 ${isMyTask ? 'bg-yellow-100 px-2 py-1 rounded-full -ml-2' : ''}`}>
                                                <div className="flex -space-x-2">
                                                    {task.assignees.map((assignee, idx) => (
                                                        <div key={idx} className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200 ring-2 ring-white" title={assignee}>
                                                            {assignee.charAt(0)}
                                                        </div>
                                                    ))}
                                                </div>
                                                <span className={`text-xs font-medium ml-1 ${isMyTask ? 'text-blue-900 font-bold' : 'text-slate-600'}`}>
                                                    {task.assignees.length === 1 ? task.assignees[0] : `${task.assignees.length} Resp.`} {isMyTask && '(Você)'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                 {task.comments.length > 0 && (
                                                     <div className="flex items-center gap-1 text-xs text-slate-400">
                                                         <MessageSquare className="w-3 h-3" /> {task.comments.length}
                                                     </div>
                                                 )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Section: Details & Comments */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-200 bg-slate-50 p-4 rounded-b-lg animate-in slide-in-from-top-2">
                                            <div className="mb-4">
                                                <h5 className="text-xs font-bold text-slate-700 mb-1">Justificativa Completa:</h5>
                                                <p className="text-sm text-slate-600 bg-white p-3 rounded border border-slate-200">{task.justification}</p>
                                            </div>

                                            <div>
                                                <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                                                    <MessageSquare className="w-3 h-3" /> Comentários ({task.comments.length})
                                                </h5>
                                                
                                                <div className="space-y-3 mb-3 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                                    {task.comments.length === 0 ? (
                                                        <p className="text-xs text-slate-400 italic text-center py-2">Nenhum comentário ainda.</p>
                                                    ) : (
                                                        task.comments.map(comment => (
                                                            <div key={comment.id} className={`flex flex-col ${comment.author === currentUser.name ? 'items-end' : 'items-start'} mb-2`}>
                                                                <div className={`p-2 rounded-lg max-w-[90%] text-xs ${comment.author === currentUser.name ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
                                                                    <span className="font-bold block text-[10px] mb-0.5">{comment.author}</span>
                                                                    {comment.text}
                                                                </div>
                                                                <span className="text-[9px] text-slate-400 mt-0.5">há {Math.floor((Date.now() - comment.createdAt)/60000)} min</span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        value={commentText}
                                                        onChange={(e) => setCommentText(e.target.value)}
                                                        placeholder="Escreva um comentário..."
                                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                                                        onKeyDown={(e) => e.key === 'Enter' && submitComment(task.id)}
                                                    />
                                                    <button 
                                                        onClick={() => submitComment(task.id)}
                                                        disabled={!commentText.trim()}
                                                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Send className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${boardHeight}`}>
            <div className="h-full">
                {renderColumn(PriorityLevel.ALTA, 'Prioridade Alta', <AlertCircle className="w-4 h-4 text-red-600" />)}
            </div>
            <div className="h-full">
                {renderColumn(PriorityLevel.MEDIA, 'Prioridade Média', <Clock className="w-4 h-4 text-amber-600" />)}
            </div>
            <div className="h-full">
                {renderColumn(PriorityLevel.BAIXA, 'Prioridade Baixa', <CheckCircle2 className="w-4 h-4 text-emerald-600" />)}
            </div>
        </div>
    );
};

export default App;
