import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { MapPin, Users, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useContacts } from "@/hooks/useContacts";
import { matchCityFromLocation } from "@/lib/matchCityFromLocation";
import { getHighestTier, getTierBadgeClass, getTierDotColor } from "@/lib/tierStyles";
import type { Contact } from "@shared/schema";

interface CityGroup {
  city: string;
  lat: number;
  lng: number;
  contacts: Contact[];
}

/** Tracks the app's manual dark-mode class on <html> (see theme-toggle.tsx) so the map tiles can match. */
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function createCityIcon(count: number, color: string): L.DivIcon {
  const size = count > 1 ? 34 : 24;
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      width:${size}px;height:${size}px;
      border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      color:white;font-weight:600;font-size:12px;
      border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.45);
    ">${count > 1 ? count : ""}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Fits the map view to all city pins whenever the contact set changes. */
function FitBoundsToGroups({ groups }: { groups: CityGroup[] }) {
  const map = useMap();

  useEffect(() => {
    if (groups.length === 0) return;
    if (groups.length === 1) {
      map.setView([groups[0].lat, groups[0].lng], 6);
      return;
    }
    const bounds = L.latLngBounds(groups.map((g): [number, number] => [g.lat, g.lng]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 5 });
  }, [groups, map]);

  return null;
}

export default function ContactMap() {
  const { contacts, isLoading } = useContacts();
  const [, setLocation] = useLocation();
  const isDark = useIsDarkMode();

  const { cityGroups, unmapped } = useMemo(() => {
    const groups = new Map<string, CityGroup>();
    const unmapped: Contact[] = [];

    for (const contact of contacts) {
      const match = matchCityFromLocation(contact.location);
      if (!match) {
        unmapped.push(contact);
        continue;
      }
      const existing = groups.get(match.name);
      if (existing) {
        existing.contacts.push(contact);
      } else {
        groups.set(match.name, { city: match.name, lat: match.lat, lng: match.lng, contacts: [contact] });
      }
    }

    return { cityGroups: Array.from(groups.values()), unmapped };
  }, [contacts]);

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contact Map</h1>
        <p className="text-sm text-muted-foreground">
          See who's where — useful when you're planning a trip and want to know who to visit.
        </p>
      </div>

      <Card className="flex-1 min-h-[500px] overflow-hidden p-0">
        <CardContent className="h-full p-0">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Loading contacts…
            </div>
          ) : (
            <MapContainer
              center={[20, 0]}
              zoom={2}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url={tileUrl}
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              <FitBoundsToGroups groups={cityGroups} />
              {cityGroups.map((group) => {
                const tier = getHighestTier(group.contacts.map((c) => c.tier));
                return (
                  <Marker
                    key={group.city}
                    position={[group.lat, group.lng]}
                    icon={createCityIcon(group.contacts.length, getTierDotColor(tier))}
                  >
                    <Popup minWidth={220}>
                      <div className="space-y-2">
                        <div className="font-semibold flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {group.city}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({group.contacts.length})
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-52 overflow-y-auto">
                          {group.contacts.map((contact) => (
                            <div key={contact.id} className="flex items-center justify-between gap-2 text-sm">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{contact.name}</div>
                                {contact.company && (
                                  <div className="truncate text-xs text-muted-foreground">{contact.company}</div>
                                )}
                              </div>
                              <Badge className={`text-xs capitalize shrink-0 ${getTierBadgeClass(contact.tier)}`}>
                                {contact.tier}
                              </Badge>
                            </div>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setLocation("/contacts")}
                        >
                          View in Contacts
                        </Button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </CardContent>
      </Card>

      {unmapped.length > 0 && (
        <Card>
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Unmapped contacts ({unmapped.length})
                </CardTitle>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-1.5 max-h-64 overflow-y-auto">
                {unmapped.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-2 text-sm py-1.5 border-t first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{contact.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {contact.location || "No location on file"}
                        {contact.company ? ` · ${contact.company}` : ""}
                      </div>
                    </div>
                    <Badge className={`text-xs capitalize shrink-0 ${getTierBadgeClass(contact.tier)}`}>
                      {contact.tier}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}
