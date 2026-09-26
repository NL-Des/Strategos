import { useParams } from 'react-router';
import { PageView } from './PageView';

export function PageRoute() {
  const { id = '' } = useParams();
  return <PageView pageId={id} />;
}
