export type VisualStyle = 'sketch' | 'pixel-art' | 'cinematic' | 'minimalist' | 'custom';
export type VideoFormat = 'Questão Armadilha' | 'Explicação 60s' | 'Ranking' | 'Correção Relâmpago' | 'Fato ENEM' | 'Geral';
export type ContentGoal = 'growth' | 'retention' | 'sales';
export type MissionType = 'reel' | 'story' | 'feed' | 'engagement';

export interface BrandContext {
  name: string;
  description: string;
  targetAudience: string;
  toneOfVoice: string;
  mainBenefits: string[];
  pricing: string;
}

export interface Campaign {
  id: string;
  title: string;
  goal: ContentGoal;
  status: 'active' | 'completed' | 'archived';
  startDate: string;
  endDate?: string;
}

export interface Mission {
  id: string;
  campaignId?: string;
  title: string;
  description: string;
  type: MissionType;
  status: 'pending' | 'completed';
  date: string;
  projectId?: string;
}

export interface ChannelProfile {
  id: string;
  name: string;
  niche: string;
  baseStyle: VisualStyle;
  customPromptSuffix: string;
  targetAudience: string;
}

export interface StoryboardItem {
  id: string;
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;
  duration: number; // Duration in seconds
  isGenerating: boolean;
  isGeneratingAudio?: boolean;
}

export interface VideoProject {
  id: string;
  profileId: string;
  title: string;
  script: string;
  format?: VideoFormat;
  hook?: string;
  subject?: string;
  caption?: string;
  cta?: string;
  hashtags?: string;
  masterAudioUrl?: string;
  storyboard: StoryboardItem[];
  isProcessingScript?: boolean;
}
