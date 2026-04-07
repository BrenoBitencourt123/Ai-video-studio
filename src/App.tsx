import React, { useState, useEffect, Component } from 'react';
import { 
  Plus, 
  Settings, 
  Image as ImageIcon, 
  Layout, 
  Play, 
  Trash2, 
  Download, 
  Sparkles, 
  ChevronRight,
  User as UserIcon,
  Youtube,
  Monitor,
  Smartphone,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileText,
  Wand2,
  Zap,
  Mic2,
  Volume2,
  Layers,
  Copy,
  FileUp,
  Target,
  Trophy,
  Calendar,
  Rocket,
  ArrowRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  updateDoc, 
  deleteDoc, 
  handleFirestoreError, 
  OperationType,
  User
} from './firebase';
import { 
  ChannelProfile, 
  VideoProject, 
  StoryboardItem, 
  VisualStyle, 
  VideoFormat,
  BrandContext,
  Campaign,
  Mission,
  MissionType,
  ContentGoal
} from './types';
import { 
  generateYouTubeImage, 
  generateRetentionScript, 
  breakdownScriptToStoryboard 
} from './services/geminiService';
import { generateStrategicPlan, generateContentForMission } from './services/strategyService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const DEFAULT_PROFILES: ChannelProfile[] = [
  {
    id: 'enem-edu',
    name: 'ENEM Master',
    niche: 'Educação / ENEM',
    baseStyle: 'custom',
    customPromptSuffix: 'Diagramas educacionais, elementos de quadro negro, textos claros em PORTUGUÊS (BRASIL).',
    targetAudience: 'Estudantes pré-vestibular'
  }
];

// Error Boundary Component
class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Ops! Algo deu errado</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Ocorreu um erro inesperado. Tente recarregar a página ou voltar para o início.
              </p>
              {this.state.error && (
                <pre className="text-[10px] text-red-400 bg-black/40 p-3 rounded-xl overflow-auto max-h-32 text-left">
                  {this.state.error.message}
                </pre>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl font-bold transition-all shadow-xl shadow-red-600/20"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [profiles, setProfiles] = useState<ChannelProfile[]>(DEFAULT_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  
  // Strategic State
  const [brandContext, setBrandContext] = useState<BrandContext | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [isSettingUpBrand, setIsSettingUpBrand] = useState(false);
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [view, setView] = useState<'mission-control' | 'video-editor'>('mission-control');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptIdea, setScriptIdea] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const disconnectKey = () => {
    setHasApiKey(false);
    // This doesn't delete the key from the system, but prevents the app from using it
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Migration and Sync logic
  useEffect(() => {
    if (isAuthReady) {
      if (user) {
        // Migrate local data to Firestore if it exists
        const migrate = async () => {
          const localProfiles = JSON.parse(localStorage.getItem('yt_profiles') || '[]');
          const localProjects = JSON.parse(localStorage.getItem('yt_projects') || '[]');

          for (const p of localProfiles) {
            try {
              const docRef = doc(db, `users/${user.uid}/profiles/${p.id}`);
              const docSnap = await getDoc(docRef);
              if (!docSnap.exists()) {
                await setDoc(docRef, { ...p, uid: user.uid });
              }
            } catch (e) {
              console.error("Migration error (profile):", e);
            }
          }

          for (const p of localProjects) {
            try {
              const docRef = doc(db, `users/${user.uid}/projects/${p.id}`);
              const docSnap = await getDoc(docRef);
              if (!docSnap.exists()) {
                await setDoc(docRef, { 
                  ...p, 
                  uid: user.uid, 
                  createdAt: p.createdAt || new Date().toISOString() 
                });
              }
            } catch (e) {
              console.error("Migration error (project):", e);
            }
          }
        };
        migrate();

        // Listen to Firestore
        const qProfiles = query(collection(db, `users/${user.uid}/profiles`));
        const unsubscribeProfiles = onSnapshot(qProfiles, (snapshot) => {
          const fetchedProfiles = snapshot.docs.map(doc => doc.data() as ChannelProfile);
          if (fetchedProfiles.length > 0) {
            setProfiles(fetchedProfiles);
            if (!activeProfileId) setActiveProfileId(fetchedProfiles[0].id);
          } else {
            setProfiles(DEFAULT_PROFILES);
            if (!activeProfileId) setActiveProfileId(DEFAULT_PROFILES[0].id);
          }
        }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/profiles`));

        const qProjects = query(collection(db, `users/${user.uid}/projects`), orderBy('createdAt', 'desc'));
        const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
          const fetchedProjects = snapshot.docs.map(doc => doc.data() as VideoProject);
          setProjects(fetchedProjects);
        }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/projects`));

        // New listeners
        const unsubscribeBrand = onSnapshot(doc(db, `users/${user.uid}/brandContext/main`), (doc) => {
          if (doc.exists()) setBrandContext(doc.data() as BrandContext);
        });

        const qCampaigns = query(collection(db, `users/${user.uid}/campaigns`), orderBy('startDate', 'desc'));
        const unsubscribeCampaigns = onSnapshot(qCampaigns, (snapshot) => {
          setCampaigns(snapshot.docs.map(doc => doc.data() as Campaign));
        });

        const qMissions = query(collection(db, `users/${user.uid}/missions`), orderBy('date', 'asc'));
        const unsubscribeMissions = onSnapshot(qMissions, (snapshot) => {
          setMissions(snapshot.docs.map(doc => doc.data() as Mission));
        });

        return () => {
          unsubscribeProfiles();
          unsubscribeProjects();
          unsubscribeBrand();
          unsubscribeCampaigns();
          unsubscribeMissions();
        };
      } else {
        // Fallback to local storage if not logged in
        const savedProfiles = localStorage.getItem('yt_profiles');
        const p = savedProfiles ? JSON.parse(savedProfiles) : DEFAULT_PROFILES;
        setProfiles(p);
        setActiveProfileId(p[0]?.id || '');

        const savedProjects = localStorage.getItem('yt_projects');
        const parsed = savedProjects ? JSON.parse(savedProjects) : [];
        setProjects(parsed.map((p: any) => ({
          ...p,
          storyboard: p.storyboard || []
        })));
      }
    }
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!user && isAuthReady) {
      localStorage.setItem('yt_profiles', JSON.stringify(profiles));
    }
  }, [profiles, user, isAuthReady]);

  useEffect(() => {
    if (!user && isAuthReady) {
      localStorage.setItem('yt_projects', JSON.stringify(projects));
    }
  }, [projects, user, isAuthReady]);

  useEffect(() => {
    if (user && isAuthReady && !brandContext) {
      setIsSettingUpBrand(true);
    }
  }, [user, isAuthReady, brandContext]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setActiveProjectId(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const createProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newProfile: ChannelProfile = {
      id: Date.now().toString(),
      name: formData.get('name') as string,
      niche: formData.get('niche') as string,
      baseStyle: formData.get('style') as VisualStyle,
      customPromptSuffix: formData.get('suffix') as string,
      targetAudience: formData.get('audience') as string,
    };

    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/profiles/${newProfile.id}`), { ...newProfile, uid: user.uid });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/profiles/${newProfile.id}`);
      }
    } else {
      setProfiles([...profiles, newProfile]);
    }
    
    setActiveProfileId(newProfile.id);
    setIsCreatingProfile(false);
  };

  const createProject = async () => {
    const newProject: VideoProject = {
      id: Date.now().toString(),
      profileId: activeProfileId,
      title: 'Novo Vídeo',
      script: '',
      storyboard: []
    };

    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/projects/${newProject.id}`), { 
          ...newProject, 
          uid: user.uid, 
          createdAt: new Date().toISOString() 
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/projects/${newProject.id}`);
      }
    } else {
      setProjects([...projects, newProject]);
    }
    
    setActiveProjectId(newProject.id);
  };

  const updateProject = async (projectId: string, updates: Partial<VideoProject> | ((p: VideoProject) => Partial<VideoProject>)) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const actualUpdates = typeof updates === 'function' ? updates(project) : updates;
    
    if (user) {
      try {
        await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}`), actualUpdates);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/projects/${projectId}`);
      }
    } else {
      setProjects(prev => prev.map(p => {
        if (p.id === projectId) {
          return { ...p, ...actualUpdates };
        }
        return p;
      }));
    }
  };

  const handleGenerateStrategy = async () => {
    if (!user || !brandContext) return;
    setIsGeneratingStrategy(true);
    try {
      const plan = await generateStrategicPlan(brandContext);
      
      const campaignId = Date.now().toString();
      const newCampaign: Campaign = {
        id: campaignId,
        title: plan.campaign.title || 'Nova Campanha',
        goal: (plan.campaign.goal as ContentGoal) || 'growth',
        status: 'active',
        startDate: new Date().toISOString()
      };

      await setDoc(doc(db, `users/${user.uid}/campaigns/${campaignId}`), { ...newCampaign, uid: user.uid });

      for (const m of plan.missions || []) {
        const missionId = Math.random().toString(36).substr(2, 9);
        const newMission: Mission = {
          id: missionId,
          campaignId: campaignId,
          title: m.title || 'Missão',
          description: m.description || '',
          type: (m.type as MissionType) || 'reel',
          status: 'pending',
          date: m.date || new Date().toISOString().split('T')[0]
        };
        await setDoc(doc(db, `users/${user.uid}/missions/${missionId}`), { ...newMission, uid: user.uid });
      }
    } catch (error) {
      console.error("Error generating strategy:", error);
    } finally {
      setIsGeneratingStrategy(false);
    }
  };

  const handleCompleteMission = async (missionId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/missions/${missionId}`), { status: 'completed' });
    } catch (error) {
      console.error("Error completing mission:", error);
    }
  };

  const handleStartMission = async (mission: Mission) => {
    if (!user || !brandContext) return;
    
    // Create a project for this mission if it doesn't exist
    if (!mission.projectId) {
      const projectId = Date.now().toString();
      
      // Generate initial script based on mission
      let initialScript = '';
      try {
        initialScript = await generateContentForMission(mission, brandContext);
      } catch (error) {
        console.error("Error generating mission content:", error);
      }

      const newProject: VideoProject = {
        id: projectId,
        profileId: activeProfileId || profiles[0]?.id || 'default',
        title: mission.title,
        script: initialScript,
        storyboard: []
      };
      
      try {
        await setDoc(doc(db, `users/${user.uid}/projects/${projectId}`), { 
          ...newProject, 
          uid: user.uid, 
          createdAt: new Date().toISOString() 
        });
        await updateDoc(doc(db, `users/${user.uid}/missions/${mission.id}`), { projectId });
        setActiveProjectId(projectId);
      } catch (error) {
        console.error("Error starting mission project:", error);
      }
    } else {
      setActiveProjectId(mission.projectId);
    }
    setView('video-editor');
  };

  const handleSaveBrand = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const context: BrandContext = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      targetAudience: formData.get('audience') as string,
      toneOfVoice: formData.get('tone') as string,
      mainBenefits: (formData.get('benefits') as string).split(',').map(b => b.trim()),
      pricing: formData.get('pricing') as string
    };

    try {
      await setDoc(doc(db, `users/${user.uid}/brandContext/main`), { ...context, uid: user.uid });
      setIsSettingUpBrand(false);
    } catch (error) {
      console.error("Error saving brand context:", error);
    }
  };
  const handleGenerateScript = async () => {
    if (!activeProject || !activeProfile || !scriptIdea) return;
    setIsGeneratingScript(true);
    try {
      const script = await generateRetentionScript(
        scriptIdea, 
        activeProfile, 
        activeProject.format || 'Geral',
        activeProject.hook
      );
      updateProject(activeProject.id, { script });
      setScriptIdea('');
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes('403') || error.message?.includes('permission')) {
        setHasApiKey(false);
      }
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleAutoStoryboard = async () => {
    if (!activeProject || !activeProfile || !activeProject.script) return;
    
    // Set processing state
    setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, isProcessingScript: true } : p));
    
    try {
      const scenes = await breakdownScriptToStoryboard(activeProject.script);
      const newStoryboard: StoryboardItem[] = scenes.map(s => ({
        id: Math.random().toString(36).substr(2, 9),
        narration: s.narration,
        imagePrompt: s.imagePrompt,
        duration: s.duration,
        isGenerating: false
      }));
      
      setProjects(prev => prev.map(p => p.id === activeProject.id ? { 
        ...p, 
        storyboard: newStoryboard,
        isProcessingScript: false 
      } : p));
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes('403') || error.message?.includes('permission')) {
        setHasApiKey(false);
      }
      setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, isProcessingScript: false } : p));
    }
  };

  const handleAudioUpload = (itemId: string, file: File) => {
    if (!activeProject) return;
    const url = URL.createObjectURL(file);
    updateProject(activeProject.id, (prev) => ({
      storyboard: prev.storyboard.map(i => i.id === itemId ? { ...i, audioUrl: url } : i)
    }));
  };

  const handleMasterAudioUpload = (file: File) => {
    if (!activeProject) return;
    const url = URL.createObjectURL(file);
    updateProject(activeProject.id, { masterAudioUrl: url });
  };

  const generateAllAssets = async () => {
    if (!activeProject) return;
    
    // Generate all images that are missing
    for (const item of activeProject.storyboard) {
      if (!item.imageUrl && item.imagePrompt) {
        await generateImageForItem(item.id);
      }
    }
  };

  const downloadAssets = async () => {
    if (!activeProject) return;
    const zip = new JSZip();
    const folder = zip.folder(activeProject.title.replace(/[^a-z0-9]/gi, '_').toLowerCase());
    
    if (!folder) return;

    // Add script
    folder.file("roteiro.txt", activeProject.script);
    folder.file("legenda.txt", `${activeProject.caption}\n\n${activeProject.hashtags}`);

    // Add segments
    for (let i = 0; i < activeProject.storyboard.length; i++) {
      const item = activeProject.storyboard[i];
      const segmentNum = (i + 1).toString().padStart(3, '0');
      
      if (item.imageUrl) {
        const imgData = item.imageUrl.split(',')[1];
        folder.file(`segment-${segmentNum}.png`, imgData, { base64: true });
      }
      
      if (item.audioUrl) {
        const audioResponse = await fetch(item.audioUrl);
        const audioBlob = await audioResponse.blob();
        folder.file(`segment-${segmentNum}.mp3`, audioBlob);
      }

      folder.file(`segment-${segmentNum}.txt`, item.narration);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_assets.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addStoryboardItem = () => {
    if (!activeProjectId) return;
    const newItem: StoryboardItem = {
      id: Date.now().toString(),
      narration: '',
      imagePrompt: '',
      duration: 5,
      isGenerating: false
    };
    updateProject(activeProjectId, (prev) => ({
      storyboard: [...prev.storyboard, newItem]
    }));
  };

  const generateImageForItem = async (itemId: string) => {
    if (!activeProject || !activeProfile) return;
    
    const item = activeProject.storyboard.find(i => i.id === itemId);
    if (!item || !item.imagePrompt) return;

    // Set loading state
    updateProject(activeProject.id, (prev) => ({
      storyboard: prev.storyboard.map(i => 
        i.id === itemId ? { ...i, isGenerating: true } : i
      )
    }));

    try {
      const url = await generateYouTubeImage(item.imagePrompt, activeProfile.baseStyle, activeProfile.customPromptSuffix);
      updateProject(activeProject.id, (prev) => ({
        storyboard: prev.storyboard.map(i => 
          i.id === itemId ? { ...i, imageUrl: url, isGenerating: false } : i
        )
      }));
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes('403') || error.message?.includes('permission')) {
        setHasApiKey(false);
      }
      updateProject(activeProject.id, (prev) => ({
        storyboard: prev.storyboard.map(i => 
          i.id === itemId ? { ...i, isGenerating: false } : i
        )
      }));
    }
  };

  const copyNarrationOnly = () => {
    if (!activeProject?.script) return;
    const narration = activeProject.script
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('[Segmento') && 
               !trimmed.startsWith('[Nota:') && 
               !trimmed.startsWith('METADADOS') &&
               !trimmed.startsWith('Formato:') &&
               !trimmed.startsWith('Matéria:') &&
               !trimmed.startsWith('Tema:') &&
               !trimmed.startsWith('Duração:') &&
               !trimmed.startsWith('Total de segmentos:') &&
               !trimmed.startsWith('Data de publicação:') &&
               !trimmed.startsWith('ROTEIRO NARRADO') &&
               !trimmed.startsWith('GANCHO') &&
               !trimmed.startsWith('CONTEXTO') &&
               !trimmed.startsWith('EXPLICAÇÃO') &&
               !trimmed.startsWith('REVELAÇÃO') &&
               !trimmed.startsWith('CTA') &&
               !trimmed.startsWith('LEGENDA') &&
               !trimmed.startsWith('DIREÇÃO VISUAL');
      })
      .map(line => line.replace(/^Apresentador:\s*/i, '').trim())
      .filter(line => line.length > 0)
      .join('\n\n');
    
    navigator.clipboard.writeText(narration);
    alert('Roteiro limpo (apenas fala) copiado para a área de transferência!');
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const activeProject = projects.find(p => p.id === activeProjectId);

  const deleteProject = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/projects/${id}`));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/projects/${id}`);
      }
    } else {
      setProjects(projects.filter(p => p.id !== id));
    }
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const deleteProfile = async (id: string) => {
    if (profiles.length <= 1) {
      alert("Você precisa de pelo menos um perfil.");
      return;
    }
    if (user) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/profiles/${id}`));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/profiles/${id}`);
      }
    } else {
      setProfiles(profiles.filter(p => p.id !== id));
    }
    if (activeProfileId === id) {
      const nextProfile = profiles.find(p => p.id !== id);
      setActiveProfileId(nextProfile?.id || '');
    }
  };

  const handleImportExcel = async (file: File) => {
    if (!activeProfileId) {
      alert("Por favor, selecione ou crie um canal (perfil) antes de importar a planilha.");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        console.log("Abas encontradas:", workbook.SheetNames);

        // Look for "Cronograma" sheet specifically, otherwise second sheet, then first
        const cronogramaSheetName = workbook.SheetNames.find(name => 
          name.toLowerCase().includes('cronograma') || 
          name.toLowerCase().includes('mês') ||
          name.toLowerCase().includes('mes')
        );
        const sheetName = cronogramaSheetName || workbook.SheetNames[1] || workbook.SheetNames[0];
        console.log("Usando a aba:", sheetName);

        const sheet = workbook.Sheets[sheetName];
        
        // Try to find the header row if it's not the first one
        // We'll convert to a 2D array first to find where the keywords are
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
        let headerRowIndex = 0;
        
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        for (let i = 0; i < Math.min(jsonRows.length, 10); i++) {
          const row = jsonRows[i];
          if (row.some(cell => typeof cell === 'string' && (
            cell.toLowerCase().includes('formato') || 
            cell.toLowerCase().includes('título') || 
            cell.toLowerCase().includes('tema')
          ))) {
            headerRowIndex = i;
            break;
          }
        }

        // Re-parse with the correct header row
        const rows = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex }) as any[];
        console.log("Linhas processadas:", rows.length);

        const newProjects: VideoProject[] = rows
          .filter(row => {
            const keys = Object.keys(row).map(k => k.toLowerCase().trim());
            return keys.some(k => k.includes('formato') || k.includes('título') || k.includes('tema'));
          })
          .map((row, index) => {
            const getVal = (keywords: string[]) => {
              const key = Object.keys(row).find(k => 
                keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
              );
              return key ? row[key] : '';
            };

            const format = getVal(['formato']);
            const subject = getVal(['matéria', 'materia', 'assunto']);
            const hook = getVal(['gancho', 'hook']);
            const title = getVal(['título', 'titulo', 'tema']) || `Vídeo ${index + 1}`;
            const caption = getVal(['legenda', 'descrição', 'descricao']);
            const cta = getVal(['cta']);
            const hashtags = getVal(['hashtag']);

            return {
              id: `imported-${Date.now()}-${index}`,
              profileId: activeProfileId,
              title: String(title),
              script: '',
              format: format as VideoFormat,
              hook: String(hook),
              subject: String(subject),
              caption: String(caption),
              cta: String(cta),
              hashtags: String(hashtags),
              storyboard: []
            };
          });

        if (newProjects.length === 0) {
          alert("Não encontramos dados válidos na aba selecionada. Verifique se os nomes das colunas estão corretos (Formato, Título, etc).");
          return;
        }

        if (user) {
          for (const p of newProjects) {
            try {
              await setDoc(doc(db, `users/${user.uid}/projects/${p.id}`), { 
                ...p, 
                uid: user.uid, 
                createdAt: new Date().toISOString() 
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/projects/${p.id}`);
            }
          }
        } else {
          setProjects(prev => [...prev, ...newProjects]);
        }
        
        setActiveProjectId(newProjects[0].id);
        alert(`${newProjects.length} vídeos importados com sucesso da aba "${sheetName}"!`);
      } catch (err) {
        console.error("Erro ao processar Excel:", err);
        alert("Erro ao ler o arquivo Excel. Verifique o formato.");
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white font-sans selection:bg-red-500/30">
      {!hasApiKey && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center mx-auto">
              <Zap className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Ative a Geração de Imagens</h2>
              <p className="text-white/60 text-sm leading-relaxed">
                Para gerar imagens de alta qualidade (Gemini 3.1), você precisa selecionar sua chave de API paga do Google Cloud.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleOpenKeyDialog}
                className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl font-bold transition-all shadow-xl shadow-red-600/20 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Selecionar Chave de API
              </button>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-xs text-white/40 hover:text-white transition-colors underline underline-offset-4"
              >
                Saiba mais sobre faturamento e cotas
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#1a1a1a] border-r border-white/5 z-20 hidden lg:flex flex-col">
        <div className="p-6 border-b border-white/5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Visual Studio</h1>
          </div>

          {/* User Auth Section */}
          <div className="pt-2">
            {user ? (
              <div className="flex items-center justify-between bg-white/5 p-2 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <img 
                    src={user.photoURL || ''} 
                    alt={user.displayName || ''} 
                    className="w-8 h-8 rounded-full border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold truncate">{user.displayName}</span>
                    <button 
                      onClick={handleLogout}
                      className="text-[10px] text-white/40 hover:text-red-500 text-left transition-colors"
                    >
                      Sair
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="w-full py-2.5 bg-white text-black rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-all"
              >
                <UserIcon className="w-4 h-4" />
                Entrar com Google
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="px-2 space-y-1">
            <button
              onClick={() => setView('mission-control')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                view === 'mission-control' 
                  ? 'bg-red-500/10 text-red-500' 
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <Target className="w-4 h-4" />
              <span className="text-sm font-medium">Mission Control</span>
            </button>
            <button
              onClick={() => setView('video-editor')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                view === 'video-editor' 
                  ? 'bg-red-500/10 text-red-500' 
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <Layout className="w-4 h-4" />
              <span className="text-sm font-medium">Editor de Vídeo</span>
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Canais / Perfis</h2>
              <button 
                onClick={() => setIsCreatingProfile(true)}
                className="p-1 hover:bg-white/5 rounded-md transition-colors text-white/60 hover:text-white"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  onClick={() => setActiveProfileId(profile.id)}
                  className={`w-full flex items-center justify-between group px-3 py-2 rounded-lg transition-all cursor-pointer ${
                    activeProfileId === profile.id 
                      ? 'bg-white/10 text-white' 
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeProfileId === profile.id ? 'bg-red-500' : 'bg-white/20'}`} />
                    <span className="text-sm font-medium truncate">{profile.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Cronograma / Projetos</h2>
              <div className="flex gap-1">
                <label className="p-1 hover:bg-white/5 rounded-md transition-colors text-white/60 hover:text-white cursor-pointer">
                  <FileUp className="w-4 h-4" />
                  <input 
                    type="file" 
                    accept=".xlsx, .xls" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportExcel(file);
                    }}
                  />
                </label>
                <button 
                  onClick={createProject}
                  className="p-1 hover:bg-white/5 rounded-md transition-colors text-white/60 hover:text-white"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {projects.filter(p => p.profileId === activeProfileId).map(project => (
                <div
                  key={project.id}
                  onClick={() => setActiveProjectId(project.id)}
                  className={`w-full flex flex-col gap-0.5 group px-3 py-2 rounded-lg transition-all cursor-pointer ${
                    activeProjectId === project.id 
                      ? 'bg-red-500/10 text-red-500' 
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{project.title}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {project.format && (
                    <span className="text-[10px] opacity-60 uppercase font-bold tracking-wider">
                      {project.format}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/5">
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-bold text-yellow-500 uppercase">Dica de Retenção</span>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Mude o visual a cada 3-5 segundos para manter o cérebro do espectador engajado.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen p-8">
        {view === 'mission-control' ? (
          <div className="max-w-6xl mx-auto space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-500 font-bold text-sm uppercase tracking-widest">
                  <Rocket className="w-4 h-4" />
                  Status do Ecossistema
                </div>
                <h1 className="text-4xl font-bold tracking-tight">
                  {brandContext?.name || 'Projeto Atlas'} <span className="text-white/20">Lvl. {Math.floor(missions.filter(m => m.status === 'completed').length / 5) + 1}</span>
                </h1>
                <p className="text-white/50 max-w-xl">
                  Seu coordenador estratégico está analisando o mercado para vender mais assinaturas.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSettingUpBrand(true)}
                  className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"
                  title="Configurar Marca"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleGenerateStrategy}
                  disabled={isGeneratingStrategy || !brandContext}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-bold transition-all flex items-center gap-2 shadow-xl shadow-red-600/20"
                >
                  {isGeneratingStrategy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  Gerar Nova Estratégia
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Missões Concluídas', value: missions.filter(m => m.status === 'completed').length, icon: CheckCircle2, color: 'text-green-500' },
                { label: 'Campanhas Ativas', value: campaigns.filter(c => c.status === 'active').length, icon: Target, color: 'text-red-500' },
                { label: 'Nível de Autoridade', value: 'Bronze', icon: Trophy, color: 'text-yellow-500' },
              ].map((stat, i) => (
                <div key={i} className="bg-[#1a1a1a] border border-white/5 p-6 rounded-[2rem] space-y-4">
                  <div className={`w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold">{stat.value}</div>
                    <div className="text-sm text-white/40">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Daily Missions */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Calendar className="w-6 h-6 text-red-500" />
                  Missões Diárias
                </h2>
                <div className="text-sm text-white/40">Próximos 7 dias</div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {missions.length === 0 ? (
                  <div className="bg-[#1a1a1a] border border-dashed border-white/10 p-12 rounded-[2rem] text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                      <Info className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/40">Nenhuma missão gerada. Clique em "Gerar Nova Estratégia" para começar.</p>
                  </div>
                ) : (
                  missions.map((mission) => (
                    <motion.div
                      key={mission.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`bg-[#1a1a1a] border border-white/5 p-6 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${mission.status === 'completed' ? 'opacity-50' : 'hover:border-red-500/30'}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          mission.type === 'reel' ? 'bg-purple-500/20 text-purple-500' :
                          mission.type === 'story' ? 'bg-orange-500/20 text-orange-500' :
                          mission.type === 'feed' ? 'bg-blue-500/20 text-blue-500' :
                          'bg-green-500/20 text-green-500'
                        }`}>
                          {mission.type === 'reel' ? <Play className="w-6 h-6" /> :
                           mission.type === 'story' ? <ImageIcon className="w-6 h-6" /> :
                           mission.type === 'feed' ? <Layout className="w-6 h-6" /> :
                           <UserIcon className="w-6 h-6" />}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{mission.date}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                              mission.type === 'reel' ? 'bg-purple-500/10 text-purple-500' :
                              mission.type === 'story' ? 'bg-orange-500/10 text-orange-500' :
                              mission.type === 'feed' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-green-500/10 text-green-500'
                            }`}>{mission.type}</span>
                          </div>
                          <h3 className="text-lg font-bold">{mission.title}</h3>
                          <p className="text-sm text-white/50 max-w-2xl">{mission.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {mission.status === 'pending' ? (
                          <>
                            <button 
                              onClick={() => handleStartMission(mission)}
                              className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                            >
                              Começar <ArrowRight className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleCompleteMission(mission.id)}
                              className="p-3 hover:bg-green-500/10 text-white/20 hover:text-green-500 rounded-xl transition-all"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
                            <CheckCircle2 className="w-5 h-5" />
                            Concluída
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Project Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveProjectId(null)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
                <div>
                  <input 
                    value={activeProject.title}
                    onChange={(e) => updateProject(activeProject.id, { title: e.target.value })}
                    className="bg-transparent border-none text-2xl font-bold focus:ring-0 p-0 w-full"
                  />
                  <div className="flex items-center gap-2 text-white/40 text-sm mt-1">
                    <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                      {activeProfile?.niche}
                    </span>
                    <span>•</span>
                    <span>{activeProject?.storyboard.length} cenas</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsPreviewing(true)}
                  disabled={!activeProject?.storyboard.length}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-30"
                >
                  <Play className="w-4 h-4" />
                  Preview do Vídeo
                </button>
                <button 
                  onClick={downloadAssets}
                  disabled={!activeProject?.storyboard.some(i => i.imageUrl || i.audioUrl)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-30"
                >
                  <Download className="w-4 h-4" />
                  Baixar Assets (.zip)
                </button>
                <button 
                  onClick={addStoryboardItem}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Cena
                </button>
              </div>
            </div>

            {/* Script Section */}
            <div className="bg-[#1a1a1a] rounded-[2.5rem] border border-white/5 overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Roteiro do Vídeo</h3>
                    <p className="text-sm text-white/50">Escreva ou gere um roteiro otimizado para retenção.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleAutoStoryboard}
                    disabled={!activeProject?.script || activeProject?.isProcessingScript}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-30"
                  >
                    {activeProject?.isProcessingScript ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-yellow-500" />}
                    Auto-Storyboard
                  </button>
                </div>
              </div>
              <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Formato do Vídeo</label>
                      <select 
                        value={activeProject.format || 'Geral'}
                        onChange={(e) => updateProject(activeProject.id, { format: e.target.value as VideoFormat })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none appearance-none"
                      >
                        <option value="Questão Armadilha">Questão Armadilha</option>
                        <option value="Explicação 60s">Explicação 60s</option>
                        <option value="Ranking">Ranking</option>
                        <option value="Correção Relâmpago">Correção Relâmpago</option>
                        <option value="Fato ENEM">Fato ENEM</option>
                        <option value="Geral">Geral / Outro</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Matéria / Assunto</label>
                      <input 
                        value={activeProject.subject || ''}
                        onChange={(e) => updateProject(activeProject.id, { subject: e.target.value })}
                        placeholder="Ex: Matemática, Redação..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Gancho (Hook 0-2s)</label>
                    <textarea 
                      value={activeProject.hook || ''}
                      onChange={(e) => updateProject(activeProject.id, { hook: e.target.value })}
                      placeholder="A frase que vai parar o scroll..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none min-h-[60px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Legenda / Descrição do Post</label>
                    <textarea 
                      value={activeProject.caption || ''}
                      onChange={(e) => updateProject(activeProject.id, { caption: e.target.value })}
                      placeholder="A legenda que vai no TikTok/Instagram..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Gerar Roteiro por IA</label>
                    <div className="flex gap-2">
                      <input 
                        value={scriptIdea}
                        onChange={(e) => setScriptIdea(e.target.value)}
                        placeholder="Título ou Tema do vídeo..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none"
                      />
                      <button 
                        onClick={handleGenerateScript}
                        disabled={isGeneratingScript || !scriptIdea}
                        className="px-4 bg-red-600 hover:bg-red-700 rounded-xl transition-all disabled:opacity-50"
                      >
                        {isGeneratingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">CTA Final</label>
                      <input 
                        value={activeProject.cta || ''}
                        onChange={(e) => updateProject(activeProject.id, { cta: e.target.value })}
                        placeholder="Ex: Segue para mais dicas!"
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Hashtags</label>
                      <input 
                        value={activeProject.hashtags || ''}
                        onChange={(e) => updateProject(activeProject.id, { hashtags: e.target.value })}
                        placeholder="#enem #estudos..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-red-500/5 rounded-xl border border-red-500/10">
                    <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Estratégia Shorts/TikTok</h4>
                    <p className="text-[11px] text-white/60 leading-relaxed">
                      Foco total no <b>Gancho</b>. O vídeo deve ter menos de 60s. Use o <b>Auto-Storyboard</b> para gerar cenas rápidas (3-5s).
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Conteúdo do Roteiro</label>
                    <button 
                      onClick={copyNarrationOnly}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest flex items-center gap-1 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      Copiar Narração para Áudio
                    </button>
                  </div>
                  <textarea 
                    value={activeProject.script}
                    onChange={(e) => updateProject(activeProject.id, { script: e.target.value })}
                    placeholder="Cole seu roteiro completo aqui ou use o gerador ao lado..."
                    className="w-full bg-black/20 border border-white/10 rounded-2xl p-4 text-sm focus:ring-1 focus:ring-red-500 outline-none min-h-[300px] font-mono leading-relaxed"
                  />
                </div>
              </div>
            </div>

            {/* Production Pipeline Section */}
            <div className="bg-gradient-to-br from-indigo-600/20 to-transparent p-8 rounded-[2.5rem] border border-indigo-500/20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <Layers className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Pipeline de Produção</h3>
                    <p className="text-sm text-white/50">Gere todos os recursos visuais e sonoros de uma vez.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {hasApiKey && (
                    <button 
                      onClick={disconnectKey}
                      className="px-4 py-2 bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-500 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                      <AlertCircle className="w-3 h-3" />
                      Pausar Gastos (Desconectar)
                    </button>
                  )}
                  <label className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer">
                    <Volume2 className="w-3 h-3 text-blue-400" />
                    {activeProject?.masterAudioUrl ? "Trocar Áudio Master" : "Upload Áudio Master (6 min)"}
                    <input 
                      type="file" 
                      accept="audio/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMasterAudioUpload(file);
                      }}
                    />
                  </label>
                  <button 
                    onClick={generateAllAssets}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-bold transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    Gerar Imagens
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Passo 1: Roteiro</span>
                  </div>
                  <p className="text-[11px] text-white/40">Defina a base narrativa do seu vídeo.</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Passo 2: Storyboard</span>
                  </div>
                  <p className="text-[11px] text-white/40">Quebre o roteiro em cenas visuais.</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">Passo 3: Ativos</span>
                  </div>
                  <p className="text-[11px] text-white/40">Gere as imagens e faça o upload do áudio.</p>
                </div>
              </div>
            </div>

            {/* Thumbnail Generator Section */}
            <div className="bg-gradient-to-br from-red-600/20 to-transparent p-8 rounded-[2.5rem] border border-red-500/20">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500 rounded-lg">
                    <Monitor className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Gerador de Thumbnail</h3>
                    <p className="text-sm text-white/50">Crie a capa perfeita para atrair cliques (CTR).</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  Foco em Viralização
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 aspect-[9/16] max-w-[300px] mx-auto bg-black rounded-2xl overflow-hidden border border-white/5 relative group shadow-2xl">
                  {activeProject?.storyboard.find(i => i.id === 'thumbnail')?.imageUrl ? (
                    <img 
                      src={activeProject.storyboard.find(i => i.id === 'thumbnail')?.imageUrl} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/20">
                      <ImageIcon className="w-16 h-16" />
                      <span className="text-sm font-bold uppercase tracking-widest">Preview da Thumbnail</span>
                    </div>
                  )}
                  {activeProject?.storyboard.find(i => i.id === 'thumbnail')?.isGenerating && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Conceito da Thumbnail (9:16)</label>
                    <textarea 
                      placeholder="Ex: Aluno desesperado com fórmulas voando ao redor, texto 'ENEM 2024' em destaque."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:ring-1 focus:ring-red-500 outline-none min-h-[120px]"
                      id="thumb-prompt"
                    />
                  </div>
                  <button 
                    onClick={async () => {
                      const prompt = (document.getElementById('thumb-prompt') as HTMLTextAreaElement).value;
                      if (!prompt) return;
                      
                      if (!activeProject || !activeProfile) return;
                      
                      const thumbId = 'thumbnail';
                      const existingThumb = activeProject.storyboard.find(i => i.id === thumbId);
                      
                      if (!existingThumb) {
                        updateProject(activeProject.id, (prev) => ({
                          storyboard: [...prev.storyboard, { id: thumbId, narration: 'Thumbnail', imagePrompt: prompt, isGenerating: true, duration: 0 }]
                        }));
                      } else {
                        updateProject(activeProject.id, (prev) => ({
                          storyboard: prev.storyboard.map(i => i.id === thumbId ? { ...i, imagePrompt: prompt, isGenerating: true } : i)
                        }));
                      }

                      try {
                        const url = await generateYouTubeImage(prompt + " (YouTube Shorts Thumbnail style, high contrast, big text areas, expressive faces)", activeProfile.baseStyle, activeProfile.customPromptSuffix, "9:16");
                        updateProject(activeProject.id, (prev) => ({
                          storyboard: prev.storyboard.map(i => i.id === thumbId ? { ...i, imageUrl: url, isGenerating: false } : i)
                        }));
                      } catch (e) {
                        updateProject(activeProject.id, (prev) => ({
                          storyboard: prev.storyboard.map(i => i.id === thumbId ? { ...i, isGenerating: false } : i)
                        }));
                      }
                    }}
                    className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    Gerar Thumbnail Viral
                  </button>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Checklist de Sucesso</h4>
                    <ul className="text-[11px] text-white/60 space-y-2">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> Rosto expressivo</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> Texto legível em mobile</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> Alto contraste de cores</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Storyboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AnimatePresence mode="popLayout">
                {activeProject?.storyboard.filter(i => i.id !== 'thumbnail').map((item, index) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#1a1a1a] rounded-3xl border border-white/5 overflow-hidden group"
                  >
                    <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden">
                      {item.imageUrl ? (
                        <img 
                          src={item.imageUrl} 
                          alt="Generated" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-white/20">
                          {item.isGenerating ? (
                            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                          ) : (
                            <>
                              <ImageIcon className="w-12 h-12" />
                              <span className="text-xs uppercase font-bold tracking-widest">Sem Imagem</span>
                            </>
                          )}
                        </div>
                      )}
                      
                      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">
                        Cena {index + 1}
                      </div>

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button 
                          onClick={() => generateImageForItem(item.id)}
                          disabled={item.isGenerating}
                          className="p-4 bg-white text-black rounded-full hover:scale-110 transition-transform disabled:opacity-50"
                        >
                          <Sparkles className="w-6 h-6" />
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Narração / Script</label>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Duração:</span>
                            <input 
                              type="number" 
                              value={item.duration || 0}
                              onChange={(e) => {
                                updateProject(activeProject.id, (prev) => ({
                                  storyboard: prev.storyboard.map(i => 
                                    i.id === item.id ? { ...i, duration: parseInt(e.target.value) || 0 } : i
                                  )
                                }));
                              }}
                              className="w-12 bg-white/5 border border-white/10 rounded-md px-1 py-0.5 text-[10px] text-center focus:ring-1 focus:ring-red-500 outline-none"
                            />
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">s</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-red-600/20 rounded-lg flex items-center justify-center text-red-500 font-bold text-xs">
                              {index + 1}
                            </div>
                            <h4 className="font-bold text-sm">Segmento {index + 1}</h4>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => generateImageForItem(item.id)}
                              disabled={item.isGenerating || !item.imagePrompt}
                              className={`p-2 rounded-lg transition-colors ${item.imageUrl ? 'text-blue-500 bg-blue-500/10' : 'text-white/40 hover:bg-white/5'}`}
                              title="Gerar Imagem (Gemini)"
                            >
                              {item.isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={() => {
                                updateProject(activeProject.id, (prev) => ({
                                  storyboard: prev.storyboard.filter(i => i.id !== item.id)
                                }));
                              }}
                              className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Narração</label>
                            <textarea 
                              placeholder="O que está sendo dito nesta cena?"
                              value={item.narration}
                              onChange={(e) => {
                                updateProject(activeProject.id, (prev) => ({
                                  storyboard: prev.storyboard.map(i => 
                                    i.id === item.id ? { ...i, narration: e.target.value } : i
                                  )
                                }));
                              }}
                              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500/50 outline-none min-h-[80px] transition-all"
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Prompt da Imagem</label>
                            <textarea 
                              placeholder="Descreva a cena visualmente..."
                              value={item.imagePrompt}
                              onChange={(e) => {
                                updateProject(activeProject.id, (prev) => ({
                                  storyboard: prev.storyboard.map(i => 
                                    i.id === item.id ? { ...i, imagePrompt: e.target.value } : i
                                  )
                                }));
                              }}
                              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:ring-1 focus:ring-red-500/50 outline-none min-h-[80px] transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              <button 
                onClick={addStoryboardItem}
                className="aspect-video bg-white/5 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 hover:bg-white/10 hover:border-white/20 transition-all group"
              >
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-white/40" />
                </div>
                <span className="text-sm font-medium text-white/40">Adicionar Nova Cena</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Create Profile Modal */}
      <AnimatePresence>
        {isCreatingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreatingProfile(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#1a1a1a] w-full max-w-md rounded-3xl border border-white/10 p-8 relative z-10"
            >
              <h2 className="text-2xl font-bold mb-6">Novo Perfil de Canal</h2>
              <form onSubmit={createProfile} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Nome do Canal</label>
                  <input name="name" required placeholder="Ex: ENEM Master" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:ring-1 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Nicho</label>
                  <input name="niche" required placeholder="Ex: Educação" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:ring-1 focus:ring-red-500 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Estilo Visual Base</label>
                  <select name="style" className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl p-3 focus:ring-1 focus:ring-red-500 outline-none appearance-none">
                    <option value="sketch">Sketch (Esboço Educativo)</option>
                    <option value="pixel-art">Pixel Art / Digital Painting</option>
                    <option value="cinematic">Cinematic (Realista)</option>
                    <option value="minimalist">Minimalista (Vetor)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Instruções Customizadas</label>
                  <textarea name="suffix" placeholder="Ex: Sempre use cores pastéis e um mascote robô." className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:ring-1 focus:ring-red-500 outline-none min-h-[80px]" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsCreatingProfile(false)} className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-colors">Cancelar</button>
                  <button type="submit" className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-colors">Criar Perfil</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Preview Modal */}
      <AnimatePresence>
        {isPreviewing && activeProject && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPreviewing(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="h-full max-h-[90vh] aspect-[9/16] bg-black rounded-3xl overflow-hidden relative z-10 border border-white/10 shadow-2xl"
            >
              <div className="absolute inset-0">
                {activeProject.storyboard.filter(i => i.id !== 'thumbnail')[currentPreviewIndex]?.imageUrl ? (
                  <motion.img 
                    key={currentPreviewIndex}
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8 }}
                    src={activeProject.storyboard.filter(i => i.id !== 'thumbnail')[currentPreviewIndex].imageUrl}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20 bg-[#0a0a0a]">
                    <ImageIcon className="w-20 h-20" />
                  </div>
                )}
                
                {/* Overlay Narration */}
                <div className="absolute bottom-0 left-0 right-0 p-12 bg-gradient-to-t from-black/80 to-transparent">
                  <motion.p 
                    key={`text-${currentPreviewIndex}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-2xl font-medium text-center max-w-3xl mx-auto leading-relaxed"
                  >
                    {activeProject.storyboard.filter(i => i.id !== 'thumbnail')[currentPreviewIndex]?.narration}
                  </motion.p>
                </div>

                {/* Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    key={`progress-${currentPreviewIndex}`}
                    transition={{ 
                      duration: 5, // Default duration if no audio
                      ease: "linear" 
                    }}
                    className="h-full bg-red-600"
                  />
                </div>

                {/* Audio Player (Hidden) */}
                {activeProject.masterAudioUrl ? (
                  <audio 
                    autoPlay 
                    src={activeProject.masterAudioUrl}
                    onTimeUpdate={(e) => {
                      const currentTime = e.currentTarget.currentTime;
                      let accumulatedTime = 0;
                      const storyboard = activeProject.storyboard.filter(i => i.id !== 'thumbnail');
                      
                      for (let i = 0; i < storyboard.length; i++) {
                        accumulatedTime += storyboard[i].duration || 5;
                        if (currentTime < accumulatedTime) {
                          if (currentPreviewIndex !== i) setCurrentPreviewIndex(i);
                          break;
                        }
                      }
                    }}
                    onEnded={() => {
                      setIsPreviewing(false);
                      setCurrentPreviewIndex(0);
                    }}
                  />
                ) : activeProject.storyboard.filter(i => i.id !== 'thumbnail')[currentPreviewIndex]?.audioUrl && (
                  <audio 
                    autoPlay 
                    src={activeProject.storyboard.filter(i => i.id !== 'thumbnail')[currentPreviewIndex].audioUrl}
                    onEnded={() => {
                      const nextIndex = currentPreviewIndex + 1;
                      if (nextIndex < activeProject.storyboard.filter(i => i.id !== 'thumbnail').length) {
                        setCurrentPreviewIndex(nextIndex);
                      } else {
                        setIsPreviewing(false);
                        setCurrentPreviewIndex(0);
                      }
                    }}
                  />
                )}

                {/* Controls */}
                <div className="absolute top-6 right-6 flex items-center gap-4">
                  <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-sm font-bold">
                    Cena {currentPreviewIndex + 1} / {activeProject.storyboard.filter(i => i.id !== 'thumbnail').length}
                  </div>
                  <button 
                    onClick={() => setIsPreviewing(false)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Brand Setup Modal */}
      <AnimatePresence>
        {isSettingUpBrand && (
          <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-2xl w-full bg-[#1a1a1a] border border-white/10 rounded-[2.5rem] p-8 space-y-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Configurar Projeto Atlas</h2>
                <button onClick={() => setIsSettingUpBrand(false)} className="p-2 hover:bg-white/5 rounded-xl">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleSaveBrand} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase">Nome da Marca</label>
                    <input name="name" defaultValue={brandContext?.name || 'Projeto Atlas'} required className="w-full bg-white/5 border-white/10 rounded-xl p-4 focus:ring-red-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase">Preço/Assinatura</label>
                    <input name="pricing" defaultValue={brandContext?.pricing} placeholder="Ex: R$ 49,90/mês" className="w-full bg-white/5 border-white/10 rounded-xl p-4 focus:ring-red-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase">O que é o Atlas? (Descrição)</label>
                  <textarea name="description" defaultValue={brandContext?.description} required rows={3} className="w-full bg-white/5 border-white/10 rounded-xl p-4 focus:ring-red-500" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase">Público-Alvo</label>
                    <input name="audience" defaultValue={brandContext?.targetAudience} placeholder="Ex: Jovens empreendedores" className="w-full bg-white/5 border-white/10 rounded-xl p-4 focus:ring-red-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase">Tom de Voz</label>
                    <input name="tone" defaultValue={brandContext?.toneOfVoice} placeholder="Ex: Inspirador, direto, técnico" className="w-full bg-white/5 border-white/10 rounded-xl p-4 focus:ring-red-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase">Principais Benefícios (separados por vírgula)</label>
                  <input name="benefits" defaultValue={brandContext?.mainBenefits?.join(', ')} placeholder="Ex: Automação, Rapidez, ROI Alto" className="w-full bg-white/5 border-white/10 rounded-xl p-4 focus:ring-red-500" />
                </div>

                <button type="submit" className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl font-bold transition-all shadow-xl shadow-red-600/20">
                  Salvar Configurações do Atlas
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
