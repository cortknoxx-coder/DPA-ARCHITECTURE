import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'syntax',
  standalone: true
})
export class SyntaxPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(code: string, lang: string): SafeHtml {
    if (!code) return '';
    
    // Basic HTML escape
    let html = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (lang === 'c' || lang === 'cpp' || lang === 'h') {
      // 1. Strings
      html = html.replace(/(".*?")/g, '<span class="text-[#ce9178]">$1</span>');
      
      // 2. Preprocessor (#include, #define)
      html = html.replace(/^(\s*#\w+)(.*)$/gm, '<span class="text-[#c586c0]">$1</span>$2');
      
      // 3. Keywords
      // FIX: Added stdint types and size_t to keywords for better highlighting.
      const keywords = /\b(void|int|char|short|long|float|double|bool|struct|enum|union|typedef|static|const|volatile|unsigned|signed|if|else|while|for|do|switch|case|default|break|continue|return|goto|sizeof|NULL|true|false|uint8_t|uint16_t|uint32_t|uint64_t|size_t)\b/g;
      html = html.replace(keywords, '<span class="text-[#569cd6]">$1</span>');
      
      // 4. Functions (word followed by paren)
      html = html.replace(/\b(\w+)(?=\()/g, '<span class="text-[#dcdcaa]">$1</span>');
      
      // 5. Comments (Single line) - simplified to avoid conflicts
      html = html.replace(/(\/\/.*$)/gm, '<span class="text-[#6a9955]">$1</span>');
      
    } else if (lang === 'cmake') {
      html = html.replace(/\b(cmake_minimum_required|project|include|set|message|add_executable|idf_component_register|REQUIRES|SRCS|INCLUDE_DIRS)\b/g, '<span class="text-[#569cd6]">$1</span>');
      html = html.replace(/(\$\{.*?\})/g, '<span class="text-[#9cdcfe]">$1</span>');
      html = html.replace(/(".*?")/g, '<span class="text-[#ce9178]">$1</span>');
    } else if (lang === 'bash') {
      html = html.replace(/(^#.*$)/gm, '<span class="text-[#6a9955]">$1</span>');
      html = html.replace(/\b(echo|openssl|set|idf\.py)\b/g, '<span class="text-[#dcdcaa]">$1</span>');
    }

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
