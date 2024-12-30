import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SocialFeedModelComponent } from './social-feed-model.component';

describe('SocialFeedModelComponent', () => {
  let component: SocialFeedModelComponent;
  let fixture: ComponentFixture<SocialFeedModelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialFeedModelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialFeedModelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
