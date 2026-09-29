import { STORAGE_KEY } from "@/lib/store-key";

/**
 * Applies the saved theme / privacy / colour settings before the first paint
 * (runs synchronously while the HTML is parsed, so there is no flash).
 */
export function ThemeScript() {
  const code = `(function(){try{var r=document.documentElement;var s=JSON.parse(localStorage.getItem(${JSON.stringify(
    STORAGE_KEY,
  )})||"null");var st=(s&&s.state&&s.state.settings)||{};var t=st.theme||"dark";if(t==="system"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}r.setAttribute("data-theme",t);r.setAttribute("data-privacy",st.privacy?"on":"off");r.setAttribute("data-cvd",st.colorblind?"on":"off")}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
