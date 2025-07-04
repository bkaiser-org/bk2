import { Component, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonCol, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { PrettyDatePipe } from '@bk2/shared/pipes';
import { CommentModel } from '@bk2/shared/models';

@Component({
  selector: 'bk-comments-list',
  imports: [
    PrettyDatePipe, TranslatePipe, AsyncPipe,
    IonRow, IonCol,
  ],
  template: `
    @if(comments().length === 0) {
      <ion-row>
        <ion-col size="12"><small>{{ '@general.noData.comments' | translate | async }}</small></ion-col>
      </ion-row>
    } @else {
      @for (comment of comments(); track comment.bkey) {
        <ion-row>
          <ion-col size="4"><small>{{ comment.creationDate | prettyDate }}/{{ comment.authorName }}</small></ion-col>
          <ion-col size="8"><small>{{ comment.description | translate | async }}</small></ion-col>  
        </ion-row>
      }
    }
`
})
export class CommentsListComponent {
  public comments = input.required<CommentModel[]>();  
}
