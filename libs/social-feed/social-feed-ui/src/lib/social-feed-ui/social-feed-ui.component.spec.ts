import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SocialFeedUiComponent } from './social-feed-ui.component';

describe('SocialFeedUiComponent', () => {
  let component: SocialFeedUiComponent;
  let fixture: ComponentFixture<SocialFeedUiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialFeedUiComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialFeedUiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
