import type { MetadataRoute } from "next"

/**
 * Sert /manifest.webmanifest. Next l'associe automatiquement au document,
 * il n'y a pas de <link rel="manifest"> a ecrire.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mon Top Albums",
    // Sous l'icone du telephone, seule cette forme courte est lisible.
    short_name: "Top Albums",
    description: "Ma sélection personnelle de mes albums préférés en mosaïque",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // L'application force le theme sombre : les couleurs du manifeste suivent.
    background_color: "#171717",
    theme_color: "#171717",
    categories: ["music", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Rognee par le systeme : le motif tient dans la zone sure centrale.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Wannabe", short_name: "Wannabe", url: "/wannabe" },
    ],
  }
}
