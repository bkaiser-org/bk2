import { Pipe, PipeTransform } from '@angular/core';
import { fileExtension } from '@bk2/shared/util-core';

@Pipe({
  name: 'fileExtension',
})
export class FileExtensionPipe implements PipeTransform {

  transform(fullPath: string): string {
      return fileExtension(fullPath);
  }
}