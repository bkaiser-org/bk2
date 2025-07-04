import { only, staticSuite} from 'vest';

import { booleanValidations, categoryValidations, dateValidations, numberValidations, stringValidations } from '@bk2/shared/util-core';
import { Periodicity, TransferModel, TransferType } from '@bk2/shared/models';
import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';

export const transferValidations = staticSuite((model: TransferModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived);
  stringValidations('index', model.index, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);

  // transfer
  dateValidations('dateOfTransfer', model.dateOfTransfer);
  categoryValidations('type', model.type, TransferType);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  // tbd: check that label is set, when type === custom

  // price
  numberValidations('price', model.price, false, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);
});






