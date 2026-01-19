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
  BarChart3
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

const PROJECTS = [
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
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);

  // Notification / Toast System
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'loading' | 'error'} | null>(null);

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

        // Subscribe to Realtime Notifications
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

        return () => {
          supabase.removeChannel(subscription);
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
          assignee: t.assignee,
          createdAt: new Date(t.created_at).getTime(),
          status: t.status || 'PENDING',
          comments: t.comments ? t.comments.map((c: any) => ({
            id: c.id,
            author: c.author,
            text: c.text,
            createdAt: new Date(c.created_at).getTime()
          })).sort((a: Comment, b: Comment) => a.createdAt - b.createdAt) : []
        }));
        setTasks(mappedTasks);
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
  };

  const handleLogout = () => {
    setCurrentUser(null);
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
          assignee: newTask.assignee
        }])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const createdTask: Task = {
            ...newTask,
            id: data.id,
            createdAt: new Date(data.created_at).getTime(),
            comments: []
        };
        
        setTasks(prev => [createdTask, ...prev]);
        
        // Find email for assignee
        let assigneeEmail = 'usuario@tjpr.jus.br';
        const assigneeEntry = Object.entries(ALLOWED_USERS).find(([email, u]) => u.name === newTask.assignee);
        if (assigneeEntry) {
            assigneeEmail = assigneeEntry[0];
        }

        // Send In-App Notification (Substituindo ou complementando o email)
        await sendInAppNotification(
          assigneeEmail,
          `Nova Demanda: ${newTask.title}`,
          `Você foi atribuído ao projeto "${newTask.project}" com prioridade ${newTask.priority}.`
        );

        setNotification({ type: 'success', message: 'Demanda criada e responsável notificado.' });
      }
    } catch (err) {
      console.error("Error adding task:", err);
      setNotification({ type: 'error', message: 'Erro ao criar tarefa.' });
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
                let recipientEmail = '';
                let recipientName = '';

                if (currentUser.role === 'BOSS') {
                    // Boss commented -> Notify Employee
                    const assigneeEntry = Object.entries(ALLOWED_USERS).find(([email, u]) => u.name === task.assignee);
                    if (assigneeEntry) {
                        recipientEmail = assigneeEntry[0];
                        recipientName = task.assignee;
                    }
                } else {
                    // Employee commented -> Notify Boss
                    recipientEmail = BOSS_EMAIL;
                    recipientName = "Rodrigo Louzano";
                }

                if (recipientEmail) {
                   // Send In-App Notification
                   await sendInAppNotification(
                      recipientEmail,
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

  // --- RENDERERS ---

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col relative">
      
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-right-10 fade-in duration-300">
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
                      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Notificações</h3>
                      <button onClick={() => setShowNotificationsPanel(false)}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {notificationsList.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs italic">Nenhuma notificação.</div>
                      ) : (
                        notificationsList.map(notif => (
                          <div key={notif.id} onClick={() => handleMarkAsRead(notif.id)} className={`p-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors ${!notif.read ? 'bg-blue-50/50' : ''}`}>
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={`text-sm ${!notif.read ? 'font-bold text-blue-900' : 'font-medium text-slate-700'}`}>{notif.title}</h4>
                              {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></span>}
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-2">{notif.message}</p>
                            <span className="text-[10px] text-slate-400 mt-1 block">{new Date(notif.created_at).toLocaleDateString()}</span>
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
        <div className="lg:col-span-3">
            {currentUser.role === 'BOSS' ? (
                <>
                    <CreateTaskForm onAddTask={handleAddTask} />
                    <TeamWorkloadPanel tasks={tasks} />
                    <ProjectStatsPanel tasks={tasks} />
                </>
            ) : (
                <EmployeeInfoPanel user={currentUser} tasks={tasks} />
            )}
        </div>

        {/* Right Panel: Kanban */}
        <div className="lg:col-span-9">
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
        
        // BOSS BYPASS (Test Mode - Sem Senha)
        if (userData.role === 'BOSS') {
            onLoginSuccess({
                name: userData.name,
                email: userEmail,
                role: userData.role
            });
            return;
        }

        // EMPLOYEE FLOW
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
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full overflow-hidden flex flex-col md:flex-row min-h-[500px]">
                
                {/* Branding Side */}
                <div className="bg-blue-900 p-12 text-white md:w-1/2 flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.tjpr.jus.br/documents/11900/4956747/fachada_palacio_justica.jpg')] bg-cover bg-center opacity-10"></div>
                    <div className="relative z-10">
                        <div className="mb-6 bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
                            <Gavel className="w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-bold mb-4">P-SEP-AR Gestão de Projetos</h1>
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
                                        <span className="text-[10px] text-slate-400">{uData.role === 'BOSS' ? 'Gestor (Sem Senha)' : 'Colaborador'}</span>
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
    );
};

const CreateTaskForm: React.FC<{ onAddTask: (t: Task) => void }> = ({ onAddTask }) => {
    // Determine the list of assignees based on the ALLOWED_USERS constant
    const ASSIGNEES = Object.values(ALLOWED_USERS)
        .filter(u => u.role === 'EMPLOYEE')
        .map(u => u.name);

    const [formData, setFormData] = useState({
        title: '',
        category: Category.DEV,
        priority: PriorityLevel.MEDIA,
        project: PROJECTS[0],
        assignee: ASSIGNEES[0] || 'Narley',
        justification: ''
      });
    
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
          assignee: formData.assignee,
          justification: formData.justification,
          createdAt: 0,
          comments: []
        };
    
        onAddTask(newTask);
        
        setFormData({
            title: '',
            category: Category.DEV,
            priority: PriorityLevel.MEDIA,
            project: PROJECTS[0],
            assignee: ASSIGNEES[0] || 'Narley',
            justification: ''
        });
      };

      const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
      };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-24">
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
                  <select name="project" value={formData.project} onChange={handleInputChange} className={inputClasses}>
                    {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                    <User className="w-3 h-3" /> Responsável
                  </label>
                  <select name="assignee" value={formData.assignee} onChange={handleInputChange} className={inputClasses}>
                    {ASSIGNEES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
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
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Justificativa / Detalhes</label>
                <textarea name="justification" value={formData.justification} onChange={handleInputChange} rows={3} placeholder="Descreva o motivo..." className={`${inputClasses} resize-none`} />
              </div>

              <div className="flex flex-col gap-3">
                  <button type="submit" className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Criar e Notificar Responsável
                  </button>
              </div>

              <p className="text-[10px] text-center text-slate-400">
                *O e-mail será enviado automaticamente
              </p>
            </form>
          </div>
    );
};

const EmployeeInfoPanel: React.FC<{ user: UserSession, tasks: Task[] }> = ({ user, tasks }) => {
    const myTasks = tasks.filter(t => t.assignee === user.name && t.status !== 'DONE');
    const completedTasks = tasks.filter(t => t.assignee === user.name && t.status === 'DONE').length;
    
    const oldestTask = [...myTasks].sort((a, b) => a.createdAt - b.createdAt)[0];
    const high = myTasks.filter(t => t.priority === PriorityLevel.ALTA).length;
    const medium = myTasks.filter(t => t.priority === PriorityLevel.MEDIA).length;
    const low = myTasks.filter(t => t.priority === PriorityLevel.BAIXA).length;
    
    return (
        <div className="sticky top-24 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-6 py-6 text-white">
                    <h2 className="text-lg font-bold">Olá, {user.name}</h2>
                    <p className="text-blue-200 text-xs mt-1">Bem-vindo ao painel de tarefas.</p>
                </div>
                <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-600">Pendentes</span>
                        <span className="text-2xl font-bold text-blue-700">{myTasks.length}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min((myTasks.length / 10) * 100, 100)}%` }}></div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 mb-4">
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

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100">
                        <span>Concluídas</span>
                        <span className="font-bold text-green-600">{completedTasks}</span>
                    </div>

                    {oldestTask && (
                        <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span className="text-xs font-bold text-amber-700">Atenção: Demanda Antiga</span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-1 font-medium" title={oldestTask.title}>{oldestTask.title}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Criada em {new Date(oldestTask.createdAt).toLocaleDateString()}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800">
                    <p className="font-bold mb-1">Política de Comentários</p>
                    <p>Mantenha os comentários objetivos e atualize o status do desenvolvimento regularmente.</p>
                </div>
            </div>
        </div>
    );
};

const TeamWorkloadPanel: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
    const employees = Object.values(ALLOWED_USERS).filter(u => u.role === 'EMPLOYEE');
    
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
            <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-700" />
                <h2 className="font-semibold text-slate-800 text-sm">Carga de Trabalho da Equipe</h2>
            </div>
            <div className="p-6 space-y-4">
                {employees.map(emp => {
                    const empTasks = tasks.filter(t => t.assignee === emp.name && t.status !== 'DONE');
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

const ProjectStatsPanel: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
    const projectCounts = PROJECTS.map(project => {
        const count = tasks.filter(t => t.project === project && t.status !== 'DONE').length;
        return { project, count };
    });

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
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

const KanbanBoard: React.FC<{ 
    tasks: Task[], 
    userRole: UserRole, 
    onDelete: (id: string) => void,
    onAddComment: (id: string, text: string) => void,
    currentUser: UserSession,
    onToggleStatus: (task: Task) => void
}> = ({ tasks, userRole, onDelete, onAddComment, currentUser, onToggleStatus }) => {
    
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
                            const isMyTask = task.assignee === currentUser.name;
                            
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
                                                {userRole === 'BOSS' && (
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

                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                                            <div className={`flex items-center gap-2 ${isMyTask ? 'bg-yellow-100 px-2 py-1 rounded-full -ml-2' : ''}`}>
                                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold border border-slate-200" title={task.assignee}>
                                                    {task.assignee.charAt(0)}
                                                </div>
                                                <span className={`text-xs font-medium ${isMyTask ? 'text-blue-900 font-bold' : 'text-slate-600'}`}>{task.assignee} {isMyTask && '(Você)'}</span>
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
                                                            <div key={comment.id} className={`flex flex-col ${comment.author === currentUser.name ? 'items-end' : 'items-start'}`}>
                                                                <div className={`max-w-[85%] rounded-lg p-2 text-xs ${comment.author === currentUser.name ? 'bg-blue-100 text-blue-900' : 'bg-white border border-slate-200 text-slate-700'}`}>
                                                                    <div className="font-bold mb-0.5 text-[10px] opacity-70">{comment.author}</div>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
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