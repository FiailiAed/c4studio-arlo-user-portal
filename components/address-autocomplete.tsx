"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface AddressParts {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: AddressParts) => void;
  id?: string;
  placeholder?: string;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GooglePlaceResult {
  address_components?: GoogleAddressComponent[];
}

interface GoogleAutocomplete {
  addListener(event: "place_changed", handler: () => void): void;
  getPlace(): GooglePlaceResult;
}

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts: Record<string, unknown>
          ) => GoogleAutocomplete;
        };
      };
    };
  }
}

function findComponent(
  components: GoogleAddressComponent[],
  type: string
): GoogleAddressComponent | undefined {
  return components.find((component) => component.types.includes(type));
}

function parseAddressComponents(
  components: GoogleAddressComponent[]
): AddressParts {
  const streetNumber = findComponent(components, "street_number")?.long_name ?? "";
  const route = findComponent(components, "route")?.long_name ?? "";
  const street = [streetNumber, route].filter(Boolean).join(" ");

  const locality =
    findComponent(components, "locality")?.long_name ??
    findComponent(components, "sublocality")?.long_name ??
    "";

  const state =
    findComponent(components, "administrative_area_level_1")?.short_name ?? "";

  const zip = findComponent(components, "postal_code")?.long_name ?? "";

  return { street, city: locality, state, zip };
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  id,
  placeholder,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!scriptLoaded || !inputRef.current || !window.google) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(
      inputRef.current,
      {
        types: ["address"],
        componentRestrictions: { country: "us" },
      }
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const components = place.address_components ?? [];
      onSelectRef.current(parseAddressComponents(components));
    });
  }, [scriptLoaded]);

  return (
    <>
      {apiKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
        />
      )}
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "123 Main St"}
      />
    </>
  );
}
