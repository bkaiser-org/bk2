
import { only, staticSuite} from 'vest';
import { LocationFormModel } from './location-form.model';
import { categoryValidations, numberValidations, stringValidations } from '@bk2/shared/util';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { LocationType } from '@bk2/shared/models';

export const locationFormValidations = staticSuite((model: LocationFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('address', model.address, SHORT_NAME_LENGTH);
  categoryValidations('locationType', model.type, LocationType);
  numberValidations('latitude', parseFloat(model.latitude ?? '0'), false, -90, 90);
  numberValidations('longitude', parseFloat(model.longitude ?? '0'), false, -180, 180);
  stringValidations('placeId', model.placeId, SHORT_NAME_LENGTH);
  stringValidations('what3words', model.what3words, SHORT_NAME_LENGTH);
  numberValidations('seaLevel', model.seaLevel, false, 0, 9000);
  numberValidations('speed', model.speed, false, 0, 300);
  numberValidations('direction', model.direction, false, -180, 180);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
});

// tbd: cross reference what3words and placeId, as well as latitude and longitude
// tbd: visibleTo: string[]


