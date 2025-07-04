import { Pipe, PipeTransform } from '@angular/core';
import { stripHtml } from '@bk2/shared/util-core';

@Pipe({
  name: 'striphtml',
})
export class StripHtmlPipe implements PipeTransform {

  transform(value: string): string {
    return stripHtml(value);
  }
}
