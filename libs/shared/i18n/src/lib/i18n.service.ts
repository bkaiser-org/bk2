import { Injectable, inject } from "@angular/core";
import { HashMap, TranslocoService, getBrowserLang } from "@jsverse/transloco";
import { Observable, of } from "rxjs";
import { selectLanguage } from "./i18n.util";
import { AvailableLanguages } from "@bk2/shared/models";

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly translocoService = inject(TranslocoService);

  public getBrowserLang(): string | undefined {
    return getBrowserLang();
  }

  public setActiveLang(language: string, defaultLanguage: string) {
    const _selectedLanguage = selectLanguage(AvailableLanguages, defaultLanguage, language);
    this.translocoService.setActiveLang(_selectedLanguage);
  }

  public getActiveLang(): string {
    return this.translocoService.getActiveLang();
  }

  // tbd: checkSupportedLang(lang: string): boolean 

  /**
   * Translate a key into the current language.
   * We need to use selectTranslate() instead of translate() in order to make sure that the translations were loaded.
   * @param key 
   * @param argument 
   * @returns 
   */
  public translate(key: string | null | undefined, argument?: HashMap): Observable<string> {
    if (!key || key.length === 0) return of('');
    if (key.startsWith('@')) {
      if (argument) {
        return this.translocoService.selectTranslate(key.substring(1), argument);
      } else {
        return this.translocoService.selectTranslate(key.substring(1));
      }
    } else {
      return of(key);
    }
  }
}

