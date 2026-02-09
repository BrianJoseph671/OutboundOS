import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Building2, 
  Linkedin, 
  Loader2, 
  Check, 
  Search,
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

function parseLines(text: string): string[] {
  return text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface EditPersonaFormProps {
  profileData: UserProfile;
  onSave: (profile: UserProfile) => void;
  onBack: () => void;
}

function EditPersonaForm({ profileData, onSave, onBack }: EditPersonaFormProps) {
  const [name, setName] = useState(profileData.name);
  const [currentRole, setCurrentRole] = useState(profileData.currentRole ?? "");
  const [company, setCompany] = useState(profileData.company ?? "");
  const [headline, setHeadline] = useState(profileData.headline ?? "");
  const [background, setBackground] = useState(profileData.background ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profileData.linkedinUrl ?? "");
  const [keyExperiencesText, setKeyExperiencesText] = useState(
    (profileData.keyExperiences ?? []).join("\n")
  );
  const [skillsText, setSkillsText] = useState((profileData.skills ?? []).join("\n"));
  const [interestsText, setInterestsText] = useState((profileData.interests ?? []).join("\n"));
  const [talkingPointsText, setTalkingPointsText] = useState(
    (profileData.talkingPoints ?? []).join("\n")
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      name: name.trim(),
      currentRole: currentRole.trim() || undefined,
      company: company.trim() || undefined,
      headline: headline.trim() || undefined,
      background: background.trim() || undefined,
      keyExperiences: parseLines(keyExperiencesText),
      skills: parseLines(skillsText),
      interests: parseLines(interestsText),
      talkingPoints: parseLines(talkingPointsText),
      linkedinUrl: linkedinUrl.trim() || undefined,
      createdAt: profileData.createdAt,
    };
    onSave(updated);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl">Edit persona</CardTitle>
          <CardDescription>
            Update your profile information below, then Save or Back to results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-company">Company</Label>
                <Input
                  id="edit-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-headline">Headline</Label>
              <Input
                id="edit-headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-currentRole">Current role</Label>
              <Input
                id="edit-currentRole"
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-linkedinUrl">LinkedIn URL</Label>
              <Input
                id="edit-linkedinUrl"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-background">Background</Label>
              <Textarea
                id="edit-background"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-keyExperiences">Key experiences (one per line)</Label>
              <Textarea
                id="edit-keyExperiences"
                value={keyExperiencesText}
                onChange={(e) => setKeyExperiencesText(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-skills">Skills (one per line)</Label>
              <Textarea
                id="edit-skills"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-interests">Interests (one per line)</Label>
              <Textarea
                id="edit-interests"
                value={interestsText}
                onChange={(e) => setInterestsText(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-talkingPoints">Talking points (one per line)</Label>
              <Textarea
                id="edit-talkingPoints"
                value={talkingPointsText}
                onChange={(e) => setTalkingPointsText(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onBack} className="flex-1">
                Back
              </Button>
              <Button type="submit" className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type Step = "inputs" | "researching" | "results" | "editPersona";

export function ProfileSetup({ onComplete, existingProfile }: ProfileSetupProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(existingProfile ? "results" : "inputs");
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
        setStep("results");
      } catch {
        toast({ title: "Failed to parse profile data", variant: "destructive" });
        setStep("inputs");
      }
    },
    onError: () => {
      toast({ title: "Research failed", description: "Please try again", variant: "destructive" });
      // Stay in researching so error UI with Retry is shown
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.personName.trim() || !formData.company.trim()) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    setStep("researching");
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

  const handleEditPersona = () => {
    setStep("editPersona");
  };

  const handleChangeInputs = () => {
    setStep("inputs");
  };

  const handleBackToResults = () => {
    setStep("results");
  };

  const handleBackToInputs = () => {
    setStep("inputs");
  };

  if (step === "researching") {
    const isError = researchMutation.isError;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-16">
            {isError ? (
              <div className="flex flex-col items-center justify-center gap-6">
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-destructive">Research failed</h2>
                  <p className="text-muted-foreground">
                    We couldn&apos;t complete the research. Please try again or go back to change your inputs.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <Button
                    variant="outline"
                    onClick={handleBackToInputs}
                    className="flex-1"
                  >
                    Back to inputs
                  </Button>
                  <Button
                    onClick={() =>
                      researchMutation.mutate({
                        personName: formData.personName.trim(),
                        company: formData.company.trim(),
                        linkedinUrl: formData.linkedinUrl.trim(),
                      })
                    }
                    disabled={researchMutation.isPending}
                    className="flex-1"
                  >
                    {researchMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  </div>
                  <Search className="w-6 h-6 text-primary absolute -top-1 -right-1" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold">Building Your Profile</h2>
                  <p className="text-muted-foreground">
                    Researching {formData.personName} at {formData.company}...
                  </p>
                  <p className="text-sm text-muted-foreground">This typically takes 15-30 seconds</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "results" && profileData) {
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

            <div className="flex flex-wrap gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={handleEditPersona}
                className="flex-1 min-w-[120px]"
                data-testid="button-edit-profile"
              >
                Edit persona
              </Button>
              <Button 
                variant="outline"
                onClick={handleChangeInputs}
                className="flex-1 min-w-[120px]"
              >
                Change inputs
              </Button>
              <Button 
                onClick={handleSaveProfile}
                className="flex-1 min-w-[120px]"
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

  if (step === "editPersona" && profileData) {
    return (
      <EditPersonaForm
        key="editPersona"
        profileData={profileData}
        onSave={(updated) => {
          setProfileData(updated);
          localStorage.setItem("userProfile", JSON.stringify(updated));
          toast({ title: "Profile updated" });
          setStep("results");
        }}
        onBack={() => setStep("results")}
      />
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
            Let&apos;s set up your profile so we can personalize your outreach messages
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
                disabled={researchMutation.isPending}
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
                disabled={researchMutation.isPending}
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
                disabled={researchMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Optional, but helps us extract more accurate profile information
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {profileData != null && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToResults}
                  className="w-full"
                >
                  Back
                </Button>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  researchMutation.isPending ||
                  !formData.personName.trim() ||
                  !formData.company.trim()
                }
                data-testid="button-setup-profile"
              >
                {researchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Research
              </Button>
            </div>
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
