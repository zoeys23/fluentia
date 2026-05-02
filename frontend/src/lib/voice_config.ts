export const VOICE_CONFIG: Record<string, {
  voiceId: string;       // ElevenLabs voice ID
  agentId: string;       // ElevenLabs Conversational AI Agent ID
  model: string;         // ElevenLabs model (eleven_flash_v2_5 default)
  sttLanguage: string;   // BCP 47 code for Whisper/transcribe hint
  displayName: string;   // e.g. "Castilian Spanish"
  tutorDefaultName: string; // e.g. "Fluencia"
}> = {
  "es-ES": { 
    voiceId: "Antoni",   
    agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "your-agent-id",
    model: "eleven_flash_v2_5", 
    sttLanguage: "es", 
    displayName: "Castilian Spanish", 
    tutorDefaultName: "Fluencia"  
  },
  "pt-BR": { 
    voiceId: "TBD",      
    agentId: "TBD",
    model: "eleven_flash_v2_5", 
    sttLanguage: "pt", 
    displayName: "Brazilian Portuguese", 
    tutorDefaultName: "Ana"   
  },
  "fr-FR": { 
    voiceId: "TBD",      
    agentId: "TBD",
    model: "eleven_flash_v2_5", 
    sttLanguage: "fr", 
    displayName: "Parisian French",   
    tutorDefaultName: "Léa"    
  },
  "ja-JP": { 
    voiceId: "TBD",      
    agentId: "TBD",
    model: "eleven_flash_v2_5", 
    sttLanguage: "ja", 
    displayName: "Japanese",          
    tutorDefaultName: "Yuki"   
  },
  "de-DE": { 
    voiceId: "TBD",      
    agentId: "TBD",
    model: "eleven_flash_v2_5", 
    sttLanguage: "de", 
    displayName: "German",            
    tutorDefaultName: "Max"    
  },
  "it-IT": { 
    voiceId: "TBD",      
    agentId: "TBD",
    model: "eleven_flash_v2_5", 
    sttLanguage: "it", 
    displayName: "Italian",           
    tutorDefaultName: "Marco"  
  },
};
