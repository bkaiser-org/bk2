import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SocialFeedDataAccessComponent } from './social-feed-data-access.component';

describe('SocialFeedDataAccessComponent', () => {
  let component: SocialFeedDataAccessComponent;
  let fixture: ComponentFixture<SocialFeedDataAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialFeedDataAccessComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialFeedDataAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
