import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Building2, 
  Linkedin, 
  Loader2, 
  Check, 
  Sparkles,
  Briefcase,
  Target,
  MessageSquare,
  Zap
} from "lucide-react";

export interface UserProfile {
  name: string;
  currentRole?: string;
  company?: string;
  headline?: string;
  background?: string;
  keyExperiences?: string[];
  skills?: string[];
  interests?: string[];
  talkingPoints?: string[];
  linkedinUrl?: string;
  createdAt: string;
}

interface ProfileSetupProps {
  onComplete: (profile: UserProfile) => void;
  existingProfile?: UserProfile | null;
}

interface ProfileResearchResponse {
  output: Array<{
    content: Array<{ text: string }>;
  }>;
}

export function ProfileSetup({ onComplete, existingProfile }: ProfileSetupProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"form" | "loading" | "review">(existingProfile ? "review" : "form");
  const [formData, setFormData] = useState({
    personName: existingProfile?.name || "",
    company: existingProfile?.company || "",
    linkedinUrl: existingProfile?.linkedinUrl || "",
  });
  const [profileData, setProfileData] = useState<UserProfile | null>(existingProfile || null);

  const researchMutation = useMutation({
    mutationFn: async (data: { personName: string; company: string; linkedinUrl: string }) => {
      const response = await apiRequest("POST", "/api/user-profile-research", data);
      return response.json() as Promise<ProfileResearchResponse>;
    },
    onSuccess: (data) => {
      try {
        let parsed: any;
        
        // Handle response format: could be { output: [{ content: [{ text: "json string" }] }] }
        // or direct JSON object with profile fields
        const text = data?.output?.[0]?.content?.[0]?.text;
        if (text && typeof text === "string") {
          parsed = JSON.parse(text);
        } else if (data && typeof data === "object") {
          // Direct JSON response
          parsed = data;
        } else {
          throw new Error("Invalid response format");
        }
        
        const profile: UserProfile = {
          name: parsed.name || formData.personName,
          currentRole: parsed.currentRole || parsed.role || "",
          company: parsed.company || formData.company,
          headline: parsed.headline || "",
          background: parsed.background || "",
          keyExperiences: parsed.keyExperiences || [],
          skills: parsed.skills || [],
          interests: parsed.interests || [],
          talkingPoints: parsed.talkingPoints || [],
          linkedinUrl: formData.linkedinUrl,
          createdAt: new Date().toISOString(),
        };
        setProfileData(profile);
        setStep("review");
      } catch {
        toast({ title: "Failed to parse profile data", variant: "destructive" });
        setStep("form");
      }
    },
    onError: () => {
      toast({ title: "Research failed", description: "Please try again", variant: "destructive" });
      setStep("form");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.personName.trim() || !formData.company.trim()) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    setStep("loading");
    researchMutation.mutate({
      personName: formData.personName.trim(),
      company: formData.company.trim(),
      linkedinUrl: formData.linkedinUrl.trim(),
    });
  };

  const handleSaveProfile = () => {
    if (profileData) {
      localStorage.setItem("userProfile", JSON.stringify(profileData));
      toast({ title: "Profile saved successfully" });
      onComplete(profileData);
    }
  };

  const handleEditProfile = () => {
    setStep("form");
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
                <Sparkles className="w-6 h-6 text-primary absolute -top-1 -right-1" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">Building Your Profile</h2>
                <p className="text-muted-foreground">
                  Researching {formData.personName} at {formData.company}...
                </p>
                <p className="text-sm text-muted-foreground">This typically takes 15-30 seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "review" && profileData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Your Profile is Ready</CardTitle>
            <CardDescription>
              Review the information below to make sure it's accurate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{profileData.name}</p>
                  {profileData.headline && (
                    <p className="text-sm text-muted-foreground">{profileData.headline}</p>
                  )}
                </div>
              </div>
              
              {profileData.currentRole && (
                <div className="flex items-start gap-3">
                  <Briefcase className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{profileData.currentRole}</p>
                    {profileData.company && (
                      <p className="text-sm text-muted-foreground">at {profileData.company}</p>
                    )}
                  </div>
                </div>
              )}

              {profileData.background && (
                <div className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <p className="text-sm">{profileData.background}</p>
                </div>
              )}
            </div>

            {profileData.keyExperiences && profileData.keyExperiences.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Key Experiences
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {profileData.keyExperiences.map((exp, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {exp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {profileData.skills && profileData.skills.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {profileData.skills.map((skill, i) => (
                    <Badge key={i} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}

            {profileData.talkingPoints && profileData.talkingPoints.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Talking Points for Outreach
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {profileData.talkingPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={handleEditProfile}
                className="flex-1"
                data-testid="button-edit-profile"
              >
                Edit Info
              </Button>
              <Button 
                onClick={handleSaveProfile}
                className="flex-1"
                data-testid="button-save-profile"
              >
                <Check className="w-4 h-4 mr-2" />
                Save Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Welcome to Outbound OS</CardTitle>
          <CardDescription>
            Let's set up your profile so we can personalize your outreach messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="personName" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name *
              </Label>
              <Input
                id="personName"
                data-testid="input-profile-name"
                placeholder="e.g. Jane Smith"
                value={formData.personName}
                onChange={(e) => setFormData(prev => ({ ...prev, personName: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Current Company *
              </Label>
              <Input
                id="company"
                data-testid="input-profile-company"
                placeholder="e.g. Acme Corp"
                value={formData.company}
                onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinUrl" className="flex items-center gap-2">
                <Linkedin className="w-4 h-4" />
                LinkedIn Profile URL
              </Label>
              <Input
                id="linkedinUrl"
                data-testid="input-profile-linkedin"
                placeholder="https://linkedin.com/in/yourprofile"
                value={formData.linkedinUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Optional, but helps us extract more accurate profile information
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!formData.personName.trim() || !formData.company.trim()}
              data-testid="button-setup-profile"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Set Up My Profile
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function getStoredProfile(): UserProfile | null {
  try {
    const stored = localStorage.getItem("userProfile");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearStoredProfile(): void {
  localStorage.removeItem("userProfile");
}
