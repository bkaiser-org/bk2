import { Component, computed, inject, model, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonIcon, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, IonRow, ItemReorderEventDetail, ToastController } from '@ionic/angular/standalone';

import { Image, ImageAction, SectionProperties } from '@bk2/shared/models';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { ImageComponent, SpinnerComponent } from '@bk2/shared/ui';
import { arrayMove } from '@bk2/shared/util';
import { deleteFileFromStorage, TranslatePipe } from '@bk2/shared/i18n';
import { SectionFormModel } from '@bk2/cms/section/util';
import { SectionService } from '@bk2/cms/section/data-access';
import { DocumentService } from '@bk2/document/data-access';

/**
 * This form lets a user compose a list of images.
 * Each image is picked from the local file system or from the camera.
 * It is then uploaded and user needs to insert some metadata about the image.
 * The list of images can be reordered.
 * The images can be removed.
 */
@Component({
  selector: 'bk-image-list',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonRow, IonCol, IonButton, IonIcon, IonList, IonItem, IonLabel,
    IonReorderGroup, IonReorder, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    SpinnerComponent, ImageComponent
  ],
  template: `
    @if(vm(); as vm) {
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ '@content.section.operation.addImage.title' | translate | async }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item lines="none">
                <ion-button (click)="addImage()" fill="clear">
                  <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
                  {{ '@content.section.operation.addImage.label' | translate | async }}
                </ion-button>
              </ion-item>
              @if(imageList(); as imageList) {
                @if(imageList.length > 0) {
                  <ion-list>
                    <ion-reorder-group disabled="false" (ionItemReorder)="handleReorder($any($event))">
                      @for(image of imageList; track image.url; let i = $index) {
                          <ion-item lines="none">
                            <ion-reorder slot="start" />
                            <bk-img [image]="patchImage(image)" (click)="editImage(image, i)" />
                            <ion-label (click)="editImage(image, i)">{{image.imageLabel}}</ion-label>
                            <ion-icon src="{{'close_cancel_circle' | svgIcon }}" slot="end" (click)="removeImage(image)" />
                          </ion-item>
                      }
                    </ion-reorder-group>
                  </ion-list>
                } @else {
                  <ion-item lines="none">
                    <ion-label>{{'@content.section.operation.addImage.empty' | translate | async}}</ion-label>
                  </ion-item>
                }
              } @else {
                <bk-spinner />
              }
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
    }
  `
})
export class ImageListComponent {
  private readonly documentService = inject(DocumentService);
  private readonly sectionService = inject(SectionService);
  private readonly toastController = inject(ToastController);

  public vm = model.required<SectionFormModel>();

  protected imageList = computed(() => this.vm().properties?.imageList ?? []);

  public changedProperties = output<SectionProperties>();

  // call modal with input form to select an image and add metadata
  protected async addImage() {
    const _imageList = this.vm().properties?.imageList ?? [];
    const _sectionKey = this.vm().bkey;
    if (_sectionKey) {
      const _image = await this.documentService.pickAndUploadImage(_sectionKey);
      if (_image) {
        _imageList.push(_image);
        this.saveAndNotify(_imageList);    
      }
    }
  }

  patchImage(image: Image): Image {
    image.isThumbnail = true;
    image.width = 80;
    image.height = 80;
    image.fill = false;
    image.isThumbnail = true;
    image.imageAction = ImageAction.None;
    return image;
  }

  protected async editImage(image: Image, index: number) {
    const _image = await this.sectionService.editImage(image);
    if (_image) {
      const _imageList = this.imageList();
      _imageList[index] = _image;
      this.saveAndNotify(_imageList);
    }
  }

  protected removeImage(image: Image) {
    const _imageList = this.vm().properties?.imageList ?? [];
    const index = _imageList.findIndex((img) => img.url === image.url);
    if (index !== -1 && image.url) {
      deleteFileFromStorage(this.toastController, image.url);
      _imageList.splice(index, 1);
      this.saveAndNotify(_imageList);
    }
  }

  private saveAndNotify(imageList: Image[]) {
    const _properties = this.vm().properties;
    console.log(imageList);
    if (_properties) {
      _properties.imageList = imageList;
    }
    this.changedProperties.emit({
      imageList
    });
  }

  public async handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    // The `from` and `to` properties contain the index of the item
    // when the drag started and ended, respectively
    const _imageList = this.vm().properties?.imageList ?? [];
    arrayMove(_imageList, ev.detail.from, ev.detail.to);
    // Finish the reorder and position the item in the DOM based on
    // where the gesture ended. This method can also be called directly
    // by the reorder group
    ev.detail.complete();
    this.saveAndNotify(_imageList);
  }
}
